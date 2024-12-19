# Configure required providers
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

# Local variables for resource naming and tagging
locals {
  resource_prefix = "pharma-pipeline-${var.environment}"
  common_labels = {
    environment = var.environment
    managed_by  = "terraform"
    project     = "pharma-pipeline"
  }
}

# Cloud Armor WAF Policy with enhanced security features
resource "google_compute_security_policy" "waf_policy" {
  provider    = google-beta
  name        = "${local.resource_prefix}-${var.cloud_armor_policy_name}"
  project     = var.project_id
  description = "Enhanced WAF policy for pharmaceutical data pipeline"

  # Enable advanced protection features
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable          = var.enable_adaptive_protection
      rule_visibility = "STANDARD"
    }
  }

  # Default rule to deny all traffic
  rule {
    action      = "deny(403)"
    priority    = 2147483647
    description = "Default deny rule"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  # Allow specific IP ranges if configured
  dynamic "rule" {
    for_each = length(var.allowed_ip_ranges) > 0 ? [1] : []
    content {
      action      = "allow"
      priority    = 1000
      description = "Allow specified IP ranges"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.allowed_ip_ranges
        }
      }
    }
  }

  # Pharmaceutical-specific attack protection rules
  rule {
    action      = "deny(403)"
    priority    = 1100
    description = "Block SQL injection attempts"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-v33-stable')"
      }
    }
  }

  rule {
    action      = "deny(403)"
    priority    = 1200
    description = "Block cross-site scripting attempts"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-v33-stable')"
      }
    }
  }

  # Rate limiting rule
  rule {
    action      = "rate_based_ban"
    priority    = 1300
    description = "Rate limiting protection"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }
    }
  }
}

# VPC Service Controls perimeter
resource "google_access_context_manager_service_perimeter" "service_perimeter" {
  provider = google-beta
  parent   = "accessPolicies/${data.google_project.project.number}"
  name     = "accessPolicies/${data.google_project.project.number}/servicePerimeters/${var.vpc_service_perimeter_name}"
  title    = "${local.resource_prefix}-perimeter"

  status {
    restricted_services = var.vpc_sc_protected_services
    vpc_accessible_services {
      enable_restriction = true
      allowed_services   = var.vpc_sc_protected_services
    }
    access_levels = [] # Configure if specific access levels are needed
  }

  use_explicit_dry_run_spec = true
}

# Cloud KMS keyring and keys
resource "google_kms_key_ring" "keyring" {
  name     = "${local.resource_prefix}-${var.kms_keyring_name}"
  location = var.region
  project  = var.project_id
}

# Create encryption keys for different data types
resource "google_kms_crypto_key" "keys" {
  for_each = toset(["raw-data", "processed-data", "secrets"])

  name            = "${local.resource_prefix}-${each.key}-key"
  key_ring        = google_kms_key_ring.keyring.id
  rotation_period = var.kms_key_rotation_period

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Service account for application components
resource "google_service_account" "app_service_account" {
  account_id   = "${local.resource_prefix}-${var.service_account_name}"
  display_name = "Pharmaceutical Pipeline Service Account - ${var.environment}"
  project      = var.project_id
}

# IAM role bindings with conditions
resource "google_project_iam_member" "service_account_roles" {
  for_each = toset(var.iam_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_service_account.email}"

  condition {
    title       = "temporary_access"
    description = "Temporary access for service account"
    expression  = "request.time < timestamp(\"2024-12-31T23:59:59Z\")"
  }
}

# Audit logging configuration
resource "google_project_iam_audit_config" "audit_config" {
  project = var.project_id
  service = "allServices"

  audit_log_config {
    log_type = "ADMIN_READ"
  }
  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

# Data source for project information
data "google_project" "project" {
  project_id = var.project_id
}

# Outputs
output "security_policy_id" {
  value       = google_compute_security_policy.waf_policy.id
  description = "Cloud Armor security policy ID"
}

output "service_perimeter_name" {
  value       = google_access_context_manager_service_perimeter.service_perimeter.name
  description = "VPC Service Controls perimeter name"
}

output "kms_keyring_id" {
  value       = google_kms_key_ring.keyring.id
  description = "Cloud KMS keyring ID"
}

output "kms_key_ids" {
  value = {
    for k, v in google_kms_crypto_key.keys : k => v.id
  }
  description = "Map of KMS encryption key IDs"
}

output "service_account_email" {
  value       = google_service_account.app_service_account.email
  description = "Service account email address"
}