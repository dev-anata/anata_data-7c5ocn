# Output definitions for Pharmaceutical Data Pipeline Platform infrastructure
# Version: 1.0.0

# Basic project information
output "project_info" {
  description = "Basic information about the GCP project including project ID, region, and environment"
  value = {
    project_id  = var.project_id
    region      = var.region
    environment = var.environment
  }
}

# Cloud Run service endpoints for external integration
output "service_endpoints" {
  description = "URLs of deployed Cloud Run services for external integration"
  value = {
    scraping_service    = module.cloud_run.scraping_service_url
    processing_service  = module.cloud_run.processing_service_url
    api_service        = module.cloud_run.api_service_url
  }
}

# Service health and monitoring information
output "service_health" {
  description = "Health status and monitoring information for deployed services"
  value = {
    status = module.cloud_run.service_statuses
    health_checks = {
      scraping_service   = "${module.cloud_run.service_statuses["scraping"] == "True" ? "Healthy" : "Unhealthy"}"
      processing_service = "${module.cloud_run.service_statuses["processing"] == "True" ? "Healthy" : "Unhealthy"}"
      api_service       = "${module.cloud_run.service_statuses["api"] == "True" ? "Healthy" : "Unhealthy"}"
    }
  }
}

# Storage resources information
output "storage_resources" {
  description = "Storage bucket information including names and URLs"
  value = {
    bucket_names = {
      raw_data       = module.storage.bucket_names["raw_data"]
      processed_data = module.storage.bucket_names["processed_data"]
      archive        = module.storage.bucket_names["archive"]
    }
    bucket_urls = {
      raw_data       = module.storage.bucket_urls["raw_data"]
      processed_data = module.storage.bucket_urls["processed_data"]
      archive        = module.storage.bucket_urls["archive"]
    }
  }
}

# BigQuery dataset information
output "bigquery_info" {
  description = "BigQuery dataset information including ID and location"
  value = {
    dataset_id = module.storage.dataset_id
    location   = module.storage.dataset_location
  }
}

# Service configuration details
output "service_config" {
  description = "Detailed configuration information for deployed services"
  value = {
    environment = var.environment
    region      = var.region
    services = {
      scraping = {
        name     = module.cloud_run.service_names["scraping"]
        url      = module.cloud_run.scraping_service_url
        status   = module.cloud_run.service_statuses["scraping"]
      }
      processing = {
        name     = module.cloud_run.service_names["processing"]
        url      = module.cloud_run.processing_service_url
        status   = module.cloud_run.service_statuses["processing"]
      }
      api = {
        name     = module.cloud_run.service_names["api"]
        url      = module.cloud_run.api_service_url
        status   = module.cloud_run.service_statuses["api"]
      }
    }
  }
}

# Storage lifecycle information
output "storage_lifecycle" {
  description = "Storage lifecycle rules and retention policies"
  value = {
    raw_data = {
      retention_days = module.storage.lifecycle_rules["raw_data"]["age"]
      action        = module.storage.lifecycle_rules["raw_data"]["type"]
    }
    processed_data = {
      retention_days = module.storage.lifecycle_rules["processed_data"]["age"]
      action        = module.storage.lifecycle_rules["processed_data"]["type"]
    }
    archive = {
      retention_days = module.storage.lifecycle_rules["archive"]["age"]
      action        = module.storage.lifecycle_rules["archive"]["type"]
    }
  }
}

# Dataset configuration details
output "dataset_details" {
  description = "Detailed BigQuery dataset configuration"
  value = {
    dataset_id           = module.storage.dataset_config["dataset_id"]
    location            = module.storage.dataset_config["location"]
    expiration_days     = module.storage.dataset_config["expiration"]
    project             = module.storage.dataset_config["project"]
  }
}