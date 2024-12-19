# Provider version constraints and backend configuration
# hashicorp/google v4.0
# hashicorp/google-beta v4.0
terraform {
  required_version = ">= 1.0.0"
  
  backend "gcs" {
    bucket            = var.state_bucket
    prefix            = "terraform/state/${var.environment}"
    encryption_key    = var.state_encryption_key
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

# Configure Google Cloud provider with project-specific settings
provider "google" {
  project               = var.project_id
  region                = var.region
  zone                  = "${var.region}-a"
  user_project_override = true
  request_timeout       = "60s"
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  zone                  = "${var.region}-a"
  user_project_override = true
  request_timeout       = "60s"
}

# Enable required GCP APIs
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
    "artifactregistry.googleapis.com"
  ])

  project = var.project_id
  service = each.value

  disable_dependent_services = true
  disable_on_destroy        = false
}

# Network infrastructure module
module "networking" {
  source = "./modules/networking"

  project_id         = var.project_id
  network_name       = var.network_name
  subnet_ip_cidr     = var.subnet_ip_cidr
  region            = var.region
  environment       = var.environment
}

# Security infrastructure module
module "security" {
  source = "./modules/security"

  project_id          = var.project_id
  environment         = var.environment
  enable_vpc_sc       = var.enable_vpc_sc
  key_rotation_period = "7776000s" # 90 days
  enable_audit_logs   = true
  allowed_regions     = ["us-central1", "us-east1"]

  depends_on = [module.networking]
}

# Storage infrastructure module
module "storage" {
  source = "./modules/storage"

  project_id           = var.project_id
  environment          = var.environment
  storage_location     = var.storage_location
  retention_periods    = var.retention_period_days
  cmek_key_id         = module.security.cmek_key_id

  depends_on = [module.security]
}

# BigQuery infrastructure module
module "bigquery" {
  source = "./modules/bigquery"

  project_id          = var.project_id
  environment         = var.environment
  dataset_location    = var.bigquery_dataset_location
  cmek_key_id         = module.security.cmek_key_id

  depends_on = [module.security]
}

# Cloud Run services module
module "cloud_run" {
  source = "./modules/cloud-run"

  project_id          = var.project_id
  region             = var.region
  environment        = var.environment
  service_account_id = var.service_account_id
  
  services = {
    scraping = {
      name           = "scraping-service"
      min_instances  = var.environment == "prod" ? 2 : 0
      max_instances  = var.environment == "prod" ? 10 : 5
      cpu           = "2"
      memory        = "4Gi"
    },
    processing = {
      name           = "processing-service"
      min_instances  = var.environment == "prod" ? 1 : 0
      max_instances  = var.environment == "prod" ? 20 : 10
      cpu           = "4"
      memory        = "8Gi"
    },
    api = {
      name           = "api-service"
      min_instances  = var.environment == "prod" ? 2 : 1
      max_instances  = var.environment == "prod" ? 30 : 15
      cpu           = "2"
      memory        = "4Gi"
    }
  }

  vpc_connector_id   = module.networking.vpc_connector_id
  depends_on         = [module.networking, module.security]
}

# Monitoring and alerting module
module "monitoring" {
  source = "./modules/monitoring"

  project_id                     = var.project_id
  environment                    = var.environment
  notification_channels         = var.monitoring_notification_channels
  cloud_run_service_ids         = module.cloud_run.service_ids
  storage_buckets              = module.storage.bucket_names
  bigquery_datasets            = module.bigquery.dataset_ids

  depends_on = [
    module.cloud_run,
    module.storage,
    module.bigquery
  ]
}

# Disaster recovery configuration
module "disaster_recovery" {
  source = "./modules/disaster-recovery"

  project_id       = var.project_id
  environment      = var.environment
  primary_region   = var.region
  backup_region    = var.region == "us-central1" ? "us-east1" : "us-central1"
  storage_buckets = module.storage.bucket_names

  depends_on = [module.storage]
}

# Output important resource information
output "cloud_run_urls" {
  description = "URLs of deployed Cloud Run services"
  value       = module.cloud_run.service_urls
}

output "storage_buckets" {
  description = "Created storage bucket names"
  value       = module.storage.bucket_names
}

output "bigquery_datasets" {
  description = "Created BigQuery dataset IDs"
  value       = module.bigquery.dataset_ids
}

output "vpc_network" {
  description = "VPC network details"
  value       = module.networking.network_details
}

output "kms_keyring" {
  description = "KMS keyring details"
  value       = module.security.kms_keyring_details
  sensitive   = true
}