# Terraform configuration for GCP storage resources
# Version: 1.0.0

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

# Local variables for resource naming and common labels
locals {
  resource_prefix = "${var.environment}-${var.project_id}"
  common_labels = merge(
    {
      environment = var.environment
      managed_by  = "terraform"
      project     = var.project_id
    },
    var.labels
  )
}

# Raw data storage bucket for initial data ingestion
resource "google_storage_bucket" "raw_data_bucket" {
  name                        = "${local.resource_prefix}-raw-data"
  project                     = var.project_id
  location                    = var.region
  storage_class              = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy              = false

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }

  lifecycle_rule {
    condition {
      age = var.bucket_lifecycle_rules.raw_data.age
    }
    action {
      type = var.bucket_lifecycle_rules.raw_data.type
    }
  }

  labels = local.common_labels
}

# Processed data storage bucket for transformed data
resource "google_storage_bucket" "processed_data_bucket" {
  name                        = "${local.resource_prefix}-processed-data"
  project                     = var.project_id
  location                    = var.region
  storage_class              = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy              = false

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }

  lifecycle_rule {
    condition {
      age = var.bucket_lifecycle_rules.processed_data.age
    }
    action {
      type = var.bucket_lifecycle_rules.processed_data.type
    }
  }

  labels = local.common_labels
}

# Archive storage bucket for long-term data retention
resource "google_storage_bucket" "archive_bucket" {
  name                        = "${local.resource_prefix}-archive"
  project                     = var.project_id
  location                    = var.region
  storage_class              = "ARCHIVE"
  uniform_bucket_level_access = true
  force_destroy              = false

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }

  lifecycle_rule {
    condition {
      age = var.bucket_lifecycle_rules.archive.age
    }
    action {
      type = var.bucket_lifecycle_rules.archive.type
    }
  }

  labels = local.common_labels
}

# BigQuery dataset for structured data storage
resource "google_bigquery_dataset" "pharma_dataset" {
  dataset_id                  = "${var.environment}_pharma_data"
  project                     = var.project_id
  location                    = var.region
  delete_contents_on_destroy  = false
  default_table_expiration_ms = var.dataset_expiration_days * 24 * 60 * 60 * 1000

  default_encryption_configuration {
    kms_key_name = var.kms_key_id
  }

  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }

  access {
    role          = "READER"
    special_group = "projectReaders"
  }

  access {
    role          = "WRITER"
    special_group = "projectWriters"
  }

  labels = local.common_labels
}

# Output values for use by other modules
output "bucket_names" {
  description = "Map of created bucket names"
  value = {
    raw_data       = google_storage_bucket.raw_data_bucket.name
    processed_data = google_storage_bucket.processed_data_bucket.name
    archive        = google_storage_bucket.archive_bucket.name
  }
}

output "bucket_urls" {
  description = "Map of created bucket URLs"
  value = {
    raw_data       = google_storage_bucket.raw_data_bucket.url
    processed_data = google_storage_bucket.processed_data_bucket.url
    archive        = google_storage_bucket.archive_bucket.url
  }
}

output "dataset_id" {
  description = "The ID of the created BigQuery dataset"
  value       = google_bigquery_dataset.pharma_dataset.dataset_id
}

output "dataset_location" {
  description = "The location of the created BigQuery dataset"
  value       = google_bigquery_dataset.pharma_dataset.location
}