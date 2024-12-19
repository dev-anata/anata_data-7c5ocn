# Service URLs for external access and integration
output "scraping_service_url" {
  description = "The URL of the deployed scraping service"
  value       = google_cloud_run_service.scraping_service.status[0].url
  sensitive   = false
}

output "processing_service_url" {
  description = "The URL of the deployed document processing service"
  value       = google_cloud_run_service.processing_service.status[0].url
  sensitive   = false
}

output "api_service_url" {
  description = "The URL of the deployed API service"
  value       = google_cloud_run_service.api_service.status[0].url
  sensitive   = false
}

# Service names for monitoring and management
output "service_names" {
  description = "Map of service names for each deployed Cloud Run service"
  value = {
    scraping   = google_cloud_run_service.scraping_service.name
    processing = google_cloud_run_service.processing_service.name
    api        = google_cloud_run_service.api_service.name
  }
  sensitive = false
}

# Service health statuses for monitoring
output "service_statuses" {
  description = "Map of service statuses for monitoring"
  value = {
    scraping   = google_cloud_run_service.scraping_service.status[0].conditions[0].status
    processing = google_cloud_run_service.processing_service.status[0].conditions[0].status
    api        = google_cloud_run_service.api_service.status[0].conditions[0].status
  }
  sensitive = false
}