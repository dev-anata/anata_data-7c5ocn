# Project and Environment Configuration
variable "project_id" {
  description = "The GCP project ID where Cloud Run services will be deployed"
  type        = string

  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID cannot be empty."
  }
}

variable "region" {
  description = "The GCP region where Cloud Run services will be deployed (us-central1 for primary, us-east1 for DR)"
  type        = string

  validation {
    condition     = can(regex("^(us-central1|us-east1)$", var.region))
    error_message = "Region must be either us-central1 (primary) or us-east1 (DR)."
  }
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod) for resource isolation"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Container Images
variable "scraping_image" {
  description = "Container image URL for the scraping service from Artifact Registry"
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9-]+)\\.pkg\\.dev/[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-/]+:[a-zA-Z0-9-_.]+$", var.scraping_image))
    error_message = "Invalid container image URL format for scraping service."
  }
}

variable "processing_image" {
  description = "Container image URL for the document processing service from Artifact Registry"
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9-]+)\\.pkg\\.dev/[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-/]+:[a-zA-Z0-9-_.]+$", var.processing_image))
    error_message = "Invalid container image URL format for processing service."
  }
}

variable "api_image" {
  description = "Container image URL for the API service from Artifact Registry"
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9-]+)\\.pkg\\.dev/[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-/]+:[a-zA-Z0-9-_.]+$", var.api_image))
    error_message = "Invalid container image URL format for API service."
  }
}

# Resource Limits
variable "scraping_cpu_limit" {
  description = "CPU limit for scraping service (2 vCPU recommended)"
  type        = string
  default     = "2"

  validation {
    condition     = can(regex("^[1-4]$", var.scraping_cpu_limit))
    error_message = "CPU limit must be between 1 and 4 vCPUs."
  }
}

variable "scraping_memory_limit" {
  description = "Memory limit for scraping service (4GB recommended)"
  type        = string
  default     = "4Gi"

  validation {
    condition     = can(regex("^[1-9][0-9]*(Mi|Gi)$", var.scraping_memory_limit))
    error_message = "Memory limit must be a valid GCP memory specification (e.g., 4Gi)."
  }
}

variable "processing_cpu_limit" {
  description = "CPU limit for processing service (4 vCPU recommended)"
  type        = string
  default     = "4"

  validation {
    condition     = can(regex("^[1-4]$", var.processing_cpu_limit))
    error_message = "CPU limit must be between 1 and 4 vCPUs."
  }
}

variable "processing_memory_limit" {
  description = "Memory limit for processing service (8GB recommended)"
  type        = string
  default     = "8Gi"

  validation {
    condition     = can(regex("^[1-9][0-9]*(Mi|Gi)$", var.processing_memory_limit))
    error_message = "Memory limit must be a valid GCP memory specification (e.g., 8Gi)."
  }
}

variable "api_cpu_limit" {
  description = "CPU limit for API service (2 vCPU recommended)"
  type        = string
  default     = "2"

  validation {
    condition     = can(regex("^[1-4]$", var.api_cpu_limit))
    error_message = "CPU limit must be between 1 and 4 vCPUs."
  }
}

variable "api_memory_limit" {
  description = "Memory limit for API service (4GB recommended)"
  type        = string
  default     = "4Gi"

  validation {
    condition     = can(regex("^[1-9][0-9]*(Mi|Gi)$", var.api_memory_limit))
    error_message = "Memory limit must be a valid GCP memory specification (e.g., 4Gi)."
  }
}

# Instance Scaling
variable "scraping_min_instances" {
  description = "Minimum number of scraping service instances (0 for cost optimization)"
  type        = number
  default     = 0

  validation {
    condition     = var.scraping_min_instances >= 0
    error_message = "Minimum instances must be greater than or equal to 0."
  }
}

variable "scraping_max_instances" {
  description = "Maximum number of scraping service instances (10 for scalability)"
  type        = number
  default     = 10

  validation {
    condition     = var.scraping_max_instances > 0 && var.scraping_max_instances <= 100
    error_message = "Maximum instances must be between 1 and 100."
  }
}

variable "processing_min_instances" {
  description = "Minimum number of processing service instances (1 for availability)"
  type        = number
  default     = 1

  validation {
    condition     = var.processing_min_instances >= 0
    error_message = "Minimum instances must be greater than or equal to 0."
  }
}

variable "processing_max_instances" {
  description = "Maximum number of processing service instances (20 for scalability)"
  type        = number
  default     = 20

  validation {
    condition     = var.processing_max_instances > 0 && var.processing_max_instances <= 100
    error_message = "Maximum instances must be between 1 and 100."
  }
}

variable "api_min_instances" {
  description = "Minimum number of API service instances (2 for high availability)"
  type        = number
  default     = 2

  validation {
    condition     = var.api_min_instances >= 0
    error_message = "Minimum instances must be greater than or equal to 0."
  }
}

variable "api_max_instances" {
  description = "Maximum number of API service instances (30 for scalability)"
  type        = number
  default     = 30

  validation {
    condition     = var.api_max_instances > 0 && var.api_max_instances <= 100
    error_message = "Maximum instances must be between 1 and 100."
  }
}

# Service Accounts and Networking
variable "service_accounts" {
  description = "Map of service account emails for each service (scraping, processing, api)"
  type = map(object({
    service_account = string
  }))

  validation {
    condition     = can([for k, v in var.service_accounts : regex("^[a-zA-Z0-9-]+@[a-zA-Z0-9-]+\\.iam\\.gserviceaccount\\.com$", v.service_account)])
    error_message = "Service account emails must be valid GCP service account email addresses."
  }
}

variable "vpc_connector" {
  description = "VPC connector name for private networking and service isolation"
  type        = string

  validation {
    condition     = can(regex("^projects/[a-z0-9-]+/locations/[a-z0-9-]+/connectors/[a-z0-9-]+$", var.vpc_connector))
    error_message = "VPC connector must be a valid fully-qualified connector name."
  }
}