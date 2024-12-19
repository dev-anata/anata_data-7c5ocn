# Production Environment Terraform Configuration
# Version: 1.0
# Required Terraform Version: >= 1.0.0

terraform {
  required_version = ">= 1.0.0"
  
  # Configure GCS backend for production state with encryption
  backend "gcs" {
    bucket = "pharma-pipeline-prod-tfstate"
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

# Production Google Cloud provider configuration
provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  request_timeout       = "60s"
  operation_timeout     = "60m"
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  request_timeout       = "60s"
  operation_timeout     = "60m"
}

# Local variables for production environment
locals {
  environment = "prod"
  regions = {
    primary = var.region
    dr      = var.backup_region
  }
  labels = {
    environment = local.environment
    managed_by  = "terraform"
    criticality = "high"
    compliance  = "regulated"
  }
}

# Root module configuration for production environment
module "root" {
  source = "../../"

  # Core configuration
  project_id  = var.project_id
  environment = local.environment

  # Regional configuration
  primary_region = local.regions.primary
  dr_region      = local.regions.dr

  # Enhanced security controls for production
  enable_security_controls = true
  vpc_sc_settings = {
    access_level = "restricted"
    allowed_regions = [
      local.regions.primary,
      local.regions.dr
    ]
    restricted_services = [
      "storage.googleapis.com",
      "bigquery.googleapis.com",
      "run.googleapis.com"
    ]
  }

  # CMEK configuration
  cmek_settings = {
    key_rotation_period = "7776000s" # 90 days
    protection_level    = "HSM"
  }

  # Production service scaling configuration
  min_instances = {
    scraping_service    = var.service_scaling["scraping"].min_instances
    processing_service  = var.service_scaling["processing"].min_instances
    api_service        = var.service_scaling["api"].min_instances
  }
  max_instances = {
    scraping_service    = var.service_scaling["scraping"].max_instances
    processing_service  = var.service_scaling["processing"].max_instances
    api_service        = var.service_scaling["api"].max_instances
  }

  # Production data retention configuration
  retention_period_days = {
    raw_data       = var.data_retention["raw_data"].active_days
    processed_data = var.data_retention["processed_data"].active_days
    system_logs    = var.data_retention["system_logs"].active_days
    audit_logs     = var.data_retention["audit_logs"].active_days
  }

  # Production monitoring configuration
  alert_thresholds = {
    cpu_utilization    = 0.8
    memory_utilization = 0.8
    error_rate         = 0.001
    latency_threshold  = 500
  }
  monitoring_notification_channels = var.monitoring_config.notification_channels

  # Production network security configuration
  network_config = {
    enable_private_google_access = true
    enable_cloud_nat            = true
    allowed_ip_ranges          = var.network_config.allowed_ip_ranges
  }

  # Cloud Armor security policies
  cloud_armor_rules = {
    default_rule_action     = "deny(403)"
    priority               = 1000
    ip_whitelist          = var.network_config.allowed_ip_ranges
    rate_limiting_threshold = var.api_rate_limits.requests_per_second
  }

  # Production backup configuration
  backup_config = {
    frequency_hours = var.backup_config.frequency_hours
    retention_count = var.backup_config.retention_count
  }

  # Labels for resource organization
  labels = local.labels
}

# Production-specific outputs
output "cloud_run_urls" {
  description = "Production Cloud Run service URLs"
  value       = module.root.cloud_run_urls
}

output "storage_buckets" {
  description = "Production storage bucket names"
  value       = module.root.storage_buckets
}

output "bigquery_datasets" {
  description = "Production BigQuery dataset IDs"
  value       = module.root.bigquery_datasets
}

output "vpc_network" {
  description = "Production VPC network details"
  value       = module.root.vpc_network
}

output "kms_keyring" {
  description = "Production KMS keyring details"
  value       = module.root.kms_keyring
  sensitive   = true
}