# Provider configuration for GCP with required versions
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.0"
    }
  }
}

# Local variables for resource configuration
locals {
  # Standard labels for all BigQuery resources
  dataset_labels = merge(var.labels, {
    environment         = terraform.workspace
    managed-by         = "terraform"
    component          = "data-warehouse"
    cost-center        = "data-platform"
    data-classification = "confidential"
  })

  # Default access configurations for the dataset
  default_access = concat(
    # Data viewers
    [for viewer in var.authorized_viewers : {
      role          = "roles/bigquery.dataViewer"
      user_by_email = viewer
    }],
    # Data editors
    [for editor in var.authorized_editors : {
      role          = "roles/bigquery.dataEditor"
      user_by_email = editor
    }]
  )

  # Audit logging configuration
  audit_configs = {
    audit_log_configs = [
      {
        log_type         = "DATA_READ"
        exempted_members = []
      },
      {
        log_type         = "DATA_WRITE"
        exempted_members = []
      }
    ]
  }

  # Table expiration calculations in milliseconds
  table_expiration_ms = {
    raw_data        = var.retention_days["raw_data"] * 24 * 60 * 60 * 1000
    processed_data  = var.retention_days["processed_data"] * 24 * 60 * 60 * 1000
    structured_data = var.retention_days["structured_data"] * 24 * 60 * 60 * 1000
  }
}

# BigQuery Dataset resource
resource "google_bigquery_dataset" "main" {
  project                     = var.project_id
  dataset_id                  = var.dataset_id
  friendly_name              = "Pharmaceutical Data Pipeline Dataset"
  description                = "Dataset for storing pharmaceutical industry data including raw, processed, and structured data"
  location                   = var.location
  default_table_expiration_ms = local.table_expiration_ms["structured_data"]
  delete_contents_on_destroy = var.delete_contents_on_destroy
  labels                     = local.dataset_labels

  # Configure customer-managed encryption key if enabled
  dynamic "encryption_configuration" {
    for_each = var.enable_cmek ? [1] : []
    content {
      kms_key_name = data.terraform_remote_state.security.outputs.kms_key_ids["bigquery"]
    }
  }

  # Access control configuration
  dynamic "access" {
    for_each = local.default_access
    content {
      role          = access.value.role
      user_by_email = access.value.user_by_email
    }
  }

  # Default owner access
  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }
}

# Raw data table
resource "google_bigquery_table" "raw_data" {
  dataset_id          = google_bigquery_dataset.main.dataset_id
  table_id            = "raw_data"
  deletion_protection = true
  project             = var.project_id

  time_partitioning {
    type          = "DAY"
    field         = "ingestion_timestamp"
    expiration_ms = local.table_expiration_ms["raw_data"]
  }

  schema = jsonencode([
    {
      name = "source_id",
      type = "STRING",
      mode = "REQUIRED",
      description = "Unique identifier of the data source"
    },
    {
      name = "ingestion_timestamp",
      type = "TIMESTAMP",
      mode = "REQUIRED",
      description = "Timestamp when the data was ingested"
    },
    {
      name = "raw_content",
      type = "STRING",
      mode = "REQUIRED",
      description = "Raw data content"
    },
    {
      name = "metadata",
      type = "JSON",
      mode = "NULLABLE",
      description = "Additional metadata about the raw data"
    }
  ])

  encryption_configuration {
    kms_key_name = var.enable_cmek ? data.terraform_remote_state.security.outputs.kms_key_ids["bigquery"] : null
  }

  labels = local.dataset_labels
}

# Processed data table
resource "google_bigquery_table" "processed_data" {
  dataset_id          = google_bigquery_dataset.main.dataset_id
  table_id            = "processed_data"
  deletion_protection = true
  project             = var.project_id

  time_partitioning {
    type          = "DAY"
    field         = "processing_timestamp"
    expiration_ms = local.table_expiration_ms["processed_data"]
  }

  clustering = ["source_id", "document_type"]

  schema = jsonencode([
    {
      name = "document_id",
      type = "STRING",
      mode = "REQUIRED",
      description = "Unique identifier of the processed document"
    },
    {
      name = "source_id",
      type = "STRING",
      mode = "REQUIRED",
      description = "Reference to source data ID"
    },
    {
      name = "document_type",
      type = "STRING",
      mode = "REQUIRED",
      description = "Type of document processed"
    },
    {
      name = "processing_timestamp",
      type = "TIMESTAMP",
      mode = "REQUIRED",
      description = "Timestamp of processing completion"
    },
    {
      name = "processed_content",
      type = "JSON",
      mode = "REQUIRED",
      description = "Processed and structured content"
    },
    {
      name = "confidence_score",
      type = "FLOAT",
      mode = "REQUIRED",
      description = "Processing confidence score"
    }
  ])

  encryption_configuration {
    kms_key_name = var.enable_cmek ? data.terraform_remote_state.security.outputs.kms_key_ids["bigquery"] : null
  }

  labels = local.dataset_labels
}

# Outputs for use in other modules
output "dataset" {
  description = "The created BigQuery dataset resource"
  value = {
    dataset_id = google_bigquery_dataset.main.dataset_id
    project    = google_bigquery_dataset.main.project
    location   = google_bigquery_dataset.main.location
  }
}

output "tables" {
  description = "The created BigQuery tables"
  value = {
    raw_data = {
      table_id = google_bigquery_table.raw_data.table_id
      schema   = google_bigquery_table.raw_data.schema
    }
    processed_data = {
      table_id = google_bigquery_table.processed_data.table_id
      schema   = google_bigquery_table.processed_data.schema
    }
  }
}