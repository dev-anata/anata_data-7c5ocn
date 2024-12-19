# Output definitions for BigQuery module resources

output "dataset_id" {
  description = "The ID of the created BigQuery dataset"
  value       = google_bigquery_dataset.main.dataset_id
}

output "dataset_project" {
  description = "The GCP project ID where the BigQuery dataset is created"
  value       = google_bigquery_dataset.main.project
}

output "dataset_location" {
  description = "The geographic location of the BigQuery dataset"
  value       = google_bigquery_dataset.main.location
}

output "table_ids" {
  description = "Map of created BigQuery table IDs"
  value = {
    raw_data       = google_bigquery_table.raw_data.table_id
    processed_data = google_bigquery_table.processed_data.table_id
  }
}

output "dataset_self_link" {
  description = "The self link URI of the BigQuery dataset"
  value       = google_bigquery_dataset.main.self_link
}

output "dataset_labels" {
  description = "Labels applied to the BigQuery dataset"
  value       = google_bigquery_dataset.main.labels
}

output "dataset_encryption_key" {
  description = "The Cloud KMS key used to encrypt the BigQuery dataset"
  value       = try(google_bigquery_dataset.main.encryption_configuration[0].kms_key_name, null)
  sensitive   = true
}

output "table_schemas" {
  description = "JSON schemas of the created BigQuery tables"
  value = {
    raw_data       = jsondecode(google_bigquery_table.raw_data.schema)
    processed_data = jsondecode(google_bigquery_table.processed_data.schema)
  }
}

output "table_expiration" {
  description = "Expiration times in milliseconds for each table type"
  value = {
    raw_data       = google_bigquery_table.raw_data.time_partitioning[0].expiration_ms
    processed_data = google_bigquery_table.processed_data.time_partitioning[0].expiration_ms
  }
}

output "dataset_access" {
  description = "Access configurations for the BigQuery dataset"
  value = {
    authorized_viewers = var.authorized_viewers
    authorized_editors = var.authorized_editors
  }
  sensitive = true
}