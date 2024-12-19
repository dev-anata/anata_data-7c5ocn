# Core Terraform variable definitions for GCP storage module

variable "project_id" {
  description = "The GCP project ID where storage resources will be created"
  type        = string

  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID must not be empty"
  }
}

variable "region" {
  description = "The GCP region where storage resources will be created"
  type        = string

  validation {
    condition     = can(regex("^[a-z]+-[a-z]+\\d+$", var.region))
    error_message = "Region must be a valid GCP region name"
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod) for resource naming and tagging"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "kms_key_id" {
  description = "The Cloud KMS key ID to use for storage encryption"
  type        = string

  validation {
    condition     = can(regex("^projects/.+/locations/.+/keyRings/.+/cryptoKeys/.+$", var.kms_key_id))
    error_message = "KMS key ID must be a valid Cloud KMS key path"
  }
}

variable "bucket_lifecycle_rules" {
  description = "Lifecycle rules for different storage buckets (raw_data, processed_data, archive)"
  type = map(object({
    age    = number
    type   = string
    action = string
  }))

  default = {
    raw_data = {
      age    = 90    # 90 days retention for raw data
      type   = "Delete"
      action = "Delete"
    }
    processed_data = {
      age    = 365   # 1 year retention for processed data
      type   = "Delete"
      action = "Delete"
    }
    archive = {
      age    = 2555  # 7 years retention for archive data
      type   = "Delete"
      action = "Delete"
    }
  }

  validation {
    condition     = can([for k, v in var.bucket_lifecycle_rules : v.age > 0 if true])
    error_message = "Lifecycle rule ages must be positive numbers"
  }

  validation {
    condition     = can([for k, v in var.bucket_lifecycle_rules : contains(["Delete", "SetStorageClass"], v.type) if true])
    error_message = "Lifecycle rule type must be either 'Delete' or 'SetStorageClass'"
  }
}

variable "dataset_expiration_days" {
  description = "Default expiration time in days for BigQuery dataset tables"
  type        = number
  default     = 365  # 1 year default retention for BigQuery tables

  validation {
    condition     = var.dataset_expiration_days >= 1
    error_message = "Dataset expiration days must be at least 1"
  }
}

variable "labels" {
  description = "Labels to apply to all storage resources"
  type        = map(string)
  default     = {}

  validation {
    condition     = can([for k, v in var.labels : regex("^[a-z][a-z0-9_-]*$", k) if true])
    error_message = "Label keys must start with a lowercase letter and only contain lowercase letters, numbers, hyphens, and underscores"
  }

  validation {
    condition     = can([for k, v in var.labels : length(v) <= 63 if true])
    error_message = "Label values must not exceed 63 characters"
  }
}