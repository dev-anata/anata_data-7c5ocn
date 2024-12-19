# Output definitions for GCP storage module
# Version: 1.0.0

# Map of Cloud Storage bucket names for each storage tier
output "bucket_names" {
  description = "Map of Cloud Storage bucket names for each storage tier"
  value = {
    raw_data       = google_storage_bucket.raw_data_bucket.name
    processed_data = google_storage_bucket.processed_data_bucket.name
    archive        = google_storage_bucket.archive_bucket.name
  }
}

# Map of Cloud Storage bucket URLs for each storage tier
output "bucket_urls" {
  description = "Map of Cloud Storage bucket URLs for each storage tier"
  value = {
    raw_data       = google_storage_bucket.raw_data_bucket.url
    processed_data = google_storage_bucket.processed_data_bucket.url
    archive        = google_storage_bucket.archive_bucket.url
  }
}

# BigQuery dataset ID for pharmaceutical data
output "dataset_id" {
  description = "BigQuery dataset ID for pharmaceutical data"
  value       = google_bigquery_dataset.pharma_dataset.dataset_id
}

# BigQuery dataset location
output "dataset_location" {
  description = "BigQuery dataset location"
  value       = google_bigquery_dataset.pharma_dataset.location
}

# Sensitive outputs with detailed bucket information
output "bucket_details" {
  description = "Detailed information about storage buckets including storage class and lifecycle rules"
  value = {
    raw_data = {
      name          = google_storage_bucket.raw_data_bucket.name
      storage_class = google_storage_bucket.raw_data_bucket.storage_class
      location      = google_storage_bucket.raw_data_bucket.location
    }
    processed_data = {
      name          = google_storage_bucket.processed_data_bucket.name
      storage_class = google_storage_bucket.processed_data_bucket.storage_class
      location      = google_storage_bucket.processed_data_bucket.location
    }
    archive = {
      name          = google_storage_bucket.archive_bucket.name
      storage_class = google_storage_bucket.archive_bucket.storage_class
      location      = google_storage_bucket.archive_bucket.location
    }
  }
}

# Dataset configuration details
output "dataset_config" {
  description = "Configuration details of the BigQuery dataset"
  value = {
    dataset_id   = google_bigquery_dataset.pharma_dataset.dataset_id
    location     = google_bigquery_dataset.pharma_dataset.location
    expiration   = var.dataset_expiration_days
    project      = google_bigquery_dataset.pharma_dataset.project
  }
}

# Storage lifecycle rules
output "lifecycle_rules" {
  description = "Applied lifecycle rules for each storage bucket"
  value = {
    raw_data       = var.bucket_lifecycle_rules.raw_data
    processed_data = var.bucket_lifecycle_rules.processed_data
    archive        = var.bucket_lifecycle_rules.archive
  }
}