# Development Environment Terraform Configuration for Pharmaceutical Data Pipeline Platform
# Version: 1.0.0
# Provider versions:
# - hashicorp/google v4.0
# - hashicorp/google-beta v4.0

terraform {
  required_version = ">= 1.0.0"

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

  # Configure GCS backend for state management
  backend "gcs" {
    bucket = "${var.project_id}-terraform-state"
    prefix = "dev"
  }
}

# Configure Google Cloud provider for development environment
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Development environment infrastructure configuration
module "root" {
  source = "../../"

  # Project configuration
  project_id = var.project_id
  environment = "dev"
  region = var.region

  # Development-specific configuration
  enable_vpc_sc = false  # Disable VPC Service Controls for development
  
  # Service configuration for development environment
  scraping_service_config = {
    min_instances = 0      # Scale to zero in dev for cost optimization
    max_instances = 5      # Limited scaling for dev workloads
    cpu_limit    = "1"     # 1 vCPU per instance
    memory_limit = "2Gi"   # 2GB memory per instance
  }

  processing_service_config = {
    min_instances = 1      # Maintain one instance for faster startup
    max_instances = 10     # Moderate scaling for processing tasks
    cpu_limit    = "2"     # 2 vCPU for processing tasks
    memory_limit = "4Gi"   # 4GB memory for processing tasks
  }

  api_service_config = {
    min_instances = 1      # Maintain one instance for API availability
    max_instances = 5      # Limited scaling for dev API usage
    cpu_limit    = "1"     # 1 vCPU per instance
    memory_limit = "2Gi"   # 2GB memory per instance
  }

  # Storage configuration
  storage_config = {
    location = "US"
    retention_period_days = {
      raw_data       = 30  # 30 days retention for raw data
      processed_data = 60  # 60 days for processed data
      system_logs    = 30  # 30 days for system logs
      audit_logs     = 90  # 90 days for audit logs in dev
      archive        = 90  # 90 days for archives in dev
    }
  }

  # Network configuration
  network_config = {
    subnet_ip_range       = "10.0.0.0/24"
    enable_private_access = true
  }

  # Monitoring configuration
  monitoring_config = {
    enable_monitoring     = true
    enable_detailed_logs  = true    # Enable detailed logging for debugging
    log_retention_days    = 30      # 30 days log retention
    alert_notification_channels = [] # No production alerts in dev
  }

  # Resource labels
  labels = {
    application  = "pharma-pipeline"
    environment  = "dev"
    terraform    = "true"
    cost_center  = "development"
  }

  # Security configuration
  security_config = {
    enable_iap           = false    # Disable Identity-Aware Proxy in dev
    enable_cloud_armor   = false    # Disable Cloud Armor in dev
    enable_audit_logs    = true     # Enable audit logs for debugging
  }

  # Backup configuration
  backup_config = {
    enable_backup    = true
    retention_days   = 7           # 7 days backup retention in dev
    schedule        = "0 0 * * *"  # Daily backups at midnight
  }
}

# Development-specific outputs
output "dev_environment_urls" {
  description = "Development environment service URLs"
  value = {
    api_service_url        = module.root.api_service_url
    scraping_service_url   = module.root.scraping_service_url
    processing_service_url = module.root.processing_service_url
  }
}

output "dev_storage_buckets" {
  description = "Development environment storage bucket names"
  value = module.root.storage_buckets
}

output "dev_bigquery_datasets" {
  description = "Development environment BigQuery dataset IDs"
  value = module.root.bigquery_datasets
}