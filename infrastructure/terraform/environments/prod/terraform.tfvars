# Project Configuration
project_id = "pharma-pipeline-prod"
region = "us-central1"
environment = "prod"

# Storage Configuration
storage_location = "US"  # Multi-regional storage for high availability
retention_period_days = {
  raw_data = 90        # 90 days retention for raw scraping data
  processed_data = 365 # 1 year retention for processed documents
  archive = 2555       # 7 years retention for archived data (regulatory compliance)
}

# BigQuery Configuration
bigquery_dataset_location = "US"  # Multi-regional dataset location
dataset_expiration_days = 365     # 1 year table expiration policy

# Network Configuration
network_name = "pharma-pipeline-prod-vpc"
subnet_ip_cidr = "10.0.0.0/24"    # Production subnet with room for expansion
enable_vpc_sc = true              # Enable VPC Service Controls for security

# Service Account
service_account_id = "pharma-pipeline-prod-sa"

# Cloud Run Service Configuration
# Scraping Service
scraping_cpu_limit = "2"          # 2 vCPU allocation
scraping_memory_limit = "4Gi"     # 4GB memory allocation
scraping_min_instances = 1        # Minimum 1 instance for availability
scraping_max_instances = 10       # Scale up to 10 instances for peak loads

# Processing Service
processing_cpu_limit = "4"        # 4 vCPU for compute-intensive tasks
processing_memory_limit = "8Gi"   # 8GB memory for document processing
processing_min_instances = 2      # Minimum 2 instances for high availability
processing_max_instances = 20     # Scale up to 20 instances for concurrent processing

# API Service
api_cpu_limit = "2"              # 2 vCPU allocation
api_memory_limit = "4Gi"         # 4GB memory allocation
api_min_instances = 3            # Minimum 3 instances for high availability
api_max_instances = 30           # Scale up to 30 instances for peak traffic

# Monitoring Configuration
monitoring_notification_channels = [
  "projects/pharma-pipeline-prod/notificationChannels/prod-alerts"
]

# Storage Lifecycle Rules
bucket_lifecycle_rules = {
  raw_data = {
    age = 90
    type = "Delete"
    action = "Delete"
  }
  processed_data = {
    age = 365
    type = "Delete"
    action = "Delete"
  }
  archive = {
    age = 2555
    type = "Delete"
    action = "Delete"
  }
}