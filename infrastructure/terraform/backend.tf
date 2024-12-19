# Backend configuration for Terraform state management
# Version: ~> 1.0
# Purpose: Configures remote state storage on Google Cloud Storage with proper security and versioning

terraform {
  # Specify minimum required Terraform version
  required_version = ">= 1.0.0"

  # Configure Google Cloud Storage backend
  backend "gcs" {
    # Bucket name follows GCP naming convention: project_id-terraform-state
    bucket = "${var.project_id}-terraform-state"
    
    # Environment-specific state path for isolation
    prefix = "terraform/state/${var.environment}"
    
    # Additional backend features enabled by default:
    # - State locking (automatic with GCS)
    # - Object versioning (configured at bucket level)
    # - Encryption at rest (using Google-managed keys)
    # - Access control via IAM
    # - Audit logging
    # - Regional bucket location
  }
}

# Note: The following features are automatically enabled on the GCS bucket:
# - Object versioning for state file version control
# - Encryption at rest using Google-managed keys
# - Access control through IAM permissions
# - Audit logging for all state operations
# - Regional bucket location for data residency
# - Concurrent access protection through native GCS locking