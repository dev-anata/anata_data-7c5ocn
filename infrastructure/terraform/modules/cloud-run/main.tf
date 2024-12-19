# Provider configuration for Google Cloud Platform
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

# Local variables for common configurations
locals {
  service_name_prefix = "${var.environment}-pharma-pipeline"
  common_labels = {
    environment = var.environment
    managed-by  = "terraform"
    project     = "pharma-pipeline"
  }
}

# Scraping Service Configuration
resource "google_cloud_run_service" "scraping_service" {
  name     = "${local.service_name_prefix}-scraping"
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = var.scraping_image
        
        resources {
          limits = {
            cpu    = var.scraping_cpu_limit
            memory = var.scraping_memory_limit
          }
        }

        # Enable Cloud SQL connections if needed
        # cloud_sql_instances = []
      }

      service_account_name = var.service_accounts.scraping.service_account
      
      # Container security context
      container_concurrency = 80
      timeout_seconds      = 300
    }

    metadata {
      labels = local.common_labels
      annotations = {
        "autoscaling.knative.dev/minScale"      = var.scraping_min_instances
        "autoscaling.knative.dev/maxScale"      = var.scraping_max_instances
        "run.googleapis.com/vpc-access-connector" = var.vpc_connector
        "run.googleapis.com/ingress"             = "internal-and-cloud-load-balancing"
        "run.googleapis.com/execution-environment" = "gen2"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
}

# Document Processing Service Configuration
resource "google_cloud_run_service" "processing_service" {
  name     = "${local.service_name_prefix}-processing"
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = var.processing_image
        
        resources {
          limits = {
            cpu    = var.processing_cpu_limit
            memory = var.processing_memory_limit
          }
        }
      }

      service_account_name = var.service_accounts.processing.service_account
      
      # Higher concurrency for processing tasks
      container_concurrency = 50
      timeout_seconds      = 900  # 15 minutes for document processing
    }

    metadata {
      labels = local.common_labels
      annotations = {
        "autoscaling.knative.dev/minScale"      = var.processing_min_instances
        "autoscaling.knative.dev/maxScale"      = var.processing_max_instances
        "run.googleapis.com/vpc-access-connector" = var.vpc_connector
        "run.googleapis.com/ingress"             = "internal"
        "run.googleapis.com/execution-environment" = "gen2"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
}

# API Service Configuration
resource "google_cloud_run_service" "api_service" {
  name     = "${local.service_name_prefix}-api"
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = var.api_image
        
        resources {
          limits = {
            cpu    = var.api_cpu_limit
            memory = var.api_memory_limit
          }
        }

        # Environment variables for API configuration
        env {
          name  = "ENVIRONMENT"
          value = var.environment
        }
      }

      service_account_name = var.service_accounts.api.service_account
      
      # Higher concurrency for API endpoints
      container_concurrency = 100
      timeout_seconds      = 60  # 1 minute timeout for API requests
    }

    metadata {
      labels = local.common_labels
      annotations = {
        "autoscaling.knative.dev/minScale"      = var.api_min_instances
        "autoscaling.knative.dev/maxScale"      = var.api_max_instances
        "run.googleapis.com/vpc-access-connector" = var.vpc_connector
        "run.googleapis.com/ingress"             = "all"
        "run.googleapis.com/execution-environment" = "gen2"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
}

# IAM Configuration for Service Invocation
resource "google_cloud_run_service_iam_member" "scraping_invoker" {
  location = google_cloud_run_service.scraping_service.location
  project  = var.project_id
  service  = google_cloud_run_service.scraping_service.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_accounts.scraping.service_account}"
}

resource "google_cloud_run_service_iam_member" "processing_invoker" {
  location = google_cloud_run_service.processing_service.location
  project  = var.project_id
  service  = google_cloud_run_service.processing_service.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_accounts.processing.service_account}"
}

resource "google_cloud_run_service_iam_member" "api_invoker" {
  location = google_cloud_run_service.api_service.location
  project  = var.project_id
  service  = google_cloud_run_service.api_service.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_accounts.api.service_account}"
}

# Outputs for service URLs and names
output "service_urls" {
  value = {
    scraping   = google_cloud_run_service.scraping_service.status[0].url
    processing = google_cloud_run_service.processing_service.status[0].url
    api        = google_cloud_run_service.api_service.status[0].url
  }
  description = "URLs of deployed Cloud Run services"
}

output "service_names" {
  value = {
    scraping   = google_cloud_run_service.scraping_service.name
    processing = google_cloud_run_service.processing_service.name
    api        = google_cloud_run_service.api_service.name
  }
  description = "Names of deployed Cloud Run services"
}