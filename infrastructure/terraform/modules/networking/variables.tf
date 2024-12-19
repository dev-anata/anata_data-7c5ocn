# Core project variables
variable "project_id" {
  description = "The GCP project ID where networking resources will be deployed"
  type        = string

  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID must not be empty"
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

# Regional configuration variables
variable "region" {
  description = "Primary GCP region for networking resources"
  type        = string
  default     = "us-central1"

  validation {
    condition     = contains(["us-central1", "us-east1"], var.region)
    error_message = "Region must be either us-central1 or us-east1"
  }
}

variable "dr_region" {
  description = "Disaster recovery GCP region"
  type        = string
  default     = "us-east1"

  validation {
    condition     = var.dr_region != var.region
    error_message = "DR region must be different from primary region"
  }
}

# Network CIDR configuration
variable "primary_subnet_cidr" {
  description = "CIDR range for the primary subnet"
  type        = string
  default     = "10.0.0.0/24"

  validation {
    condition     = can(cidrhost(var.primary_subnet_cidr, 0))
    error_message = "Primary subnet CIDR must be a valid CIDR range"
  }
}

variable "dr_subnet_cidr" {
  description = "CIDR range for the DR subnet"
  type        = string
  default     = "10.0.1.0/24"

  validation {
    condition     = var.dr_subnet_cidr != var.primary_subnet_cidr
    error_message = "DR subnet CIDR must be different from primary subnet CIDR"
  }
}

# Network monitoring and logging
variable "flow_logs_sampling" {
  description = "Sampling rate for VPC flow logs (0.0-1.0)"
  type        = number
  default     = 0.5

  validation {
    condition     = var.flow_logs_sampling >= 0 && var.flow_logs_sampling <= 1
    error_message = "Flow logs sampling must be between 0 and 1"
  }
}

# NAT configuration
variable "nat_ip_allocate_option" {
  description = "How external IPs should be allocated for Cloud NAT"
  type        = string
  default     = "AUTO_ONLY"

  validation {
    condition     = contains(["AUTO_ONLY", "MANUAL_ONLY"], var.nat_ip_allocate_option)
    error_message = "NAT IP allocation must be either AUTO_ONLY or MANUAL_ONLY"
  }
}

# Private service access configuration
variable "private_ip_prefix_length" {
  description = "Prefix length for private IP address range"
  type        = number
  default     = 16

  validation {
    condition     = var.private_ip_prefix_length >= 8 && var.private_ip_prefix_length <= 29
    error_message = "Private IP prefix length must be between 8 and 29"
  }
}

# Security configuration
variable "enable_vpc_sc" {
  description = "Enable VPC Service Controls"
  type        = bool
  default     = false
}