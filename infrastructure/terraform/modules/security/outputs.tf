# Cloud Armor WAF policy outputs
output "security_policy_id" {
  description = "ID of the Cloud Armor WAF security policy"
  value       = google_compute_security_policy.waf_policy.id
}

output "security_policy_name" {
  description = "Name of the Cloud Armor WAF security policy"
  value       = google_compute_security_policy.waf_policy.name
}

output "security_policy_fingerprint" {
  description = "Fingerprint of the Cloud Armor WAF security policy for tracking changes"
  value       = google_compute_security_policy.waf_policy.fingerprint
}

# VPC Service Controls outputs
output "service_perimeter_name" {
  description = "Name of the VPC Service Controls perimeter"
  value       = google_access_context_manager_service_perimeter.service_perimeter.name
}

output "service_perimeter_status" {
  description = "Current status of the VPC Service Controls perimeter"
  value       = google_access_context_manager_service_perimeter.service_perimeter.status
}

# Cloud KMS outputs
output "kms_keyring_id" {
  description = "ID of the Cloud KMS keyring"
  value       = google_kms_key_ring.keyring.id
}

output "kms_keyring_name" {
  description = "Name of the Cloud KMS keyring"
  value       = google_kms_key_ring.keyring.name
}

output "kms_key_ids" {
  description = "Map of Cloud KMS encryption key IDs by purpose (raw-data, processed-data, secrets)"
  value       = {
    for k, v in google_kms_crypto_key.keys : k => v.id
  }
}

output "kms_key_versions" {
  description = "Map of current Cloud KMS encryption key versions by purpose"
  value       = {
    for k, v in google_kms_crypto_key.keys : k => v.version
  }
}

# Service Account outputs
output "service_account_email" {
  description = "Email address of the service account"
  value       = google_service_account.app_service_account.email
}

output "service_account_id" {
  description = "Unique ID of the service account"
  value       = google_service_account.app_service_account.unique_id
}

output "service_account_name" {
  description = "Fully-qualified name of the service account"
  value       = google_service_account.app_service_account.name
}

# IAM outputs
output "assigned_roles" {
  description = "List of IAM roles assigned to the service account"
  value       = [for role in google_project_iam_member.service_account_roles : role.role]
}

# Audit logging outputs
output "audit_config" {
  description = "Audit logging configuration for the project"
  value       = google_project_iam_audit_config.audit_config.audit_log_config
}

# Combined security configuration output
output "security_config" {
  description = "Combined security configuration details for reference"
  value = {
    environment           = var.environment
    region               = var.region
    waf_policy_enabled   = true
    vpc_sc_enabled       = true
    kms_enabled          = true
    protected_services   = var.vpc_sc_protected_services
    key_rotation_period  = var.kms_key_rotation_period
    adaptive_protection  = var.enable_adaptive_protection
  }
}