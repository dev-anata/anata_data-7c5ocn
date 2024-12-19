# Main Terraform configuration for staging environment
# Version: 1.0
# This file orchestrates the deployment of staging infrastructure components

terraform {
  required_version = ">= 1.0.0"

  # Configure GCS backend for Terraform state management
  backend "gcs" {
    bucket = "pharma-pipeline-staging-tf-state"
    prefix = "terraform/state"
  }

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

# Configure Google Cloud provider for staging environment
provider "google" {
  project = var.project_id
  region  = var.region

  # Enable request timeout for better error handling
  request_timeout = "60s"
}

provider "google-beta" {
  project = var.project_id
  region  = var.region

  # Enable request timeout for better error handling
  request_timeout = "60s"
}

# Import root module with staging-specific configurations
module "root" {
  source = "../.."

  # Core project configuration
  project_id         = var.project_id
  environment        = var.environment
  region            = var.region
  
  # Service account configuration
  service_account_id = "pharma-pipeline-staging-sa"
  
  # Security configuration
  enable_vpc_sc     = true # Enable VPC Service Controls for staging
  
  # Data retention configuration
  retention_period_days = {
    raw_data       = var.data_retention_config.raw_data_days
    processed_data = var.data_retention_config.processed_data_days
    system_logs    = var.data_retention_config.logs_retention_days
    audit_logs     = 365  # 1 year retention for audit logs
    archive        = 2555 # 7 years retention for archived data
  }

  # Service scaling configuration for staging
  scraping_min_instances   = var.scaling_parameters.scraping.min_instances
  scraping_max_instances   = var.scaling_parameters.scraping.max_instances
  processing_min_instances = var.scaling_parameters.processing.min_instances
  processing_max_instances = var.scaling_parameters.processing.max_instances
  api_min_instances       = var.scaling_parameters.api.min_instances
  api_max_instances       = var.scaling_parameters.api.max_instances

  # Resource limits for staging services
  service_resource_limits = var.resource_limits

  # Deployment strategy configuration
  deployment_strategy = {
    rollout_strategy       = var.deployment_strategy.rollout_strategy
    timeout_seconds        = var.deployment_strategy.timeout_seconds
    success_rate_threshold = var.deployment_strategy.success_rate_threshold
  }

  # Monitoring configuration
  monitoring_config = {
    enable_monitoring          = var.enable_monitoring
    notification_channels      = var.monitoring_config.alert_notification_channels
    metrics_retention_days     = var.monitoring_config.metrics_retention_days
    log_retention_days        = var.monitoring_config.log_retention_days
  }

  # Labels for resource organization and cost tracking
  labels = {
    environment = "staging"
    managed_by  = "terraform"
    project     = "pharma-pipeline"
    version     = "1.0"
  }

  # Dependencies and additional configurations
  depends_on = [
    google_project_service.required_apis
  ]
}

# Enable required GCP APIs for staging environment
resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudrun.googleapis.com",
    "storage.googleapis.com",
    "bigquery.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudkms.googleapis.com",
    "containerregistry.googleapis.com",
    "artifactregistry.googleapis.com",
    "vpcaccess.googleapis.com"
  ])

  project = var.project_id
  service = each.value

  # Disable dependent services when API is disabled
  disable_dependent_services = true
  
  # Keep API enabled on resource destruction to prevent disruption
  disable_on_destroy = false
}

# Output important resource information
output "cloud_run_services" {
  description = "Cloud Run service URLs and configurations"
  value       = module.root.cloud_run_urls
}

output "storage_buckets" {
  description = "Storage bucket details"
  value       = module.root.storage_buckets
}

output "bigquery_datasets" {
  description = "BigQuery dataset information"
  value       = module.root.bigquery_datasets
}

output "vpc_network" {
  description = "VPC network configuration"
  value       = module.root.vpc_network
}

output "monitoring_config" {
  description = "Monitoring and alerting configuration"
  value = {
    enabled              = var.enable_monitoring
    retention_days       = var.monitoring_config.metrics_retention_days
    notification_channels = var.monitoring_config.alert_notification_channels
  }
}