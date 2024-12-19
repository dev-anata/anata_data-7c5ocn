# Core project variables
variable "project_id" {
  description = "The GCP project ID where security resources will be deployed"
  type        = string

  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID must not be empty"
  }
}

variable "region" {
  description = "GCP region for regional security resources"
  type        = string
  default     = "us-central1"

  validation {
    condition     = contains(["us-central1", "us-east1"], var.region)
    error_message = "Region must be either us-central1 or us-east1"
  }
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

# Cloud Armor WAF configuration variables
variable "cloud_armor_policy_name" {
  description = "Name of the Cloud Armor security policy"
  type        = string
  default     = "pharma-pipeline-waf"
}

variable "enable_adaptive_protection" {
  description = "Enable Cloud Armor adaptive protection feature"
  type        = bool
  default     = true
}

variable "allowed_ip_ranges" {
  description = "List of allowed IP CIDR ranges for Cloud Armor"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for ip in var.allowed_ip_ranges : can(cidrhost(ip, 0))])
    error_message = "All IP ranges must be valid CIDR notation"
  }
}

# VPC Service Controls configuration variables
variable "vpc_service_perimeter_name" {
  description = "Name of the VPC Service Controls perimeter"
  type        = string
  default     = "pharma_pipeline_perimeter"
}

variable "vpc_sc_protected_services" {
  description = "List of GCP services to protect with VPC Service Controls"
  type        = list(string)
  default     = ["storage.googleapis.com", "bigquery.googleapis.com", "run.googleapis.com"]

  validation {
    condition     = length(var.vpc_sc_protected_services) > 0
    error_message = "At least one protected service must be specified"
  }
}

# Cloud KMS configuration variables
variable "kms_keyring_name" {
  description = "Name of the Cloud KMS keyring"
  type        = string
  default     = "pharma-pipeline-keyring"
}

variable "kms_key_rotation_period" {
  description = "Rotation period for KMS encryption keys in seconds (90 days)"
  type        = string
  default     = "7776000s"

  validation {
    condition     = can(regex("^[0-9]+s$", var.kms_key_rotation_period))
    error_message = "Key rotation period must be specified in seconds with 's' suffix"
  }
}

# IAM and Service Account configuration variables
variable "service_account_name" {
  description = "Name of the service account for application components"
  type        = string
  default     = "pharma-pipeline-sa"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{6,30}$", var.service_account_name))
    error_message = "Service account name must be 6-30 characters long and match the pattern: ^[a-z][a-z0-9-]{6,30}$"
  }
}

variable "iam_roles" {
  description = "List of IAM roles to assign to the service account"
  type        = list(string)
  default = [
    "roles/storage.objectViewer",
    "roles/bigquery.dataViewer",
    "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  ]

  validation {
    condition     = length(var.iam_roles) > 0
    error_message = "At least one IAM role must be specified"
  }
}