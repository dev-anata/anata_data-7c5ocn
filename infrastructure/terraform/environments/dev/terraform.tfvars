# Project Configuration
project_id = "pharma-pipeline-dev"
region     = "us-central1"
environment = "dev"

# Service Scaling Parameters - Development Environment
service_scaling = {
  scraping = {
    min_instances = 0
    max_instances = 5
    cpu_limit    = "1"
    memory_limit = "2Gi"
  }
  processing = {
    min_instances = 1
    max_instances = 10
    cpu_limit    = "2"
    memory_limit = "4Gi"
  }
  api = {
    min_instances = 1
    max_instances = 15
    cpu_limit    = "1"
    memory_limit = "2Gi"
  }
}

# Storage Configuration
storage_retention = {
  raw_data       = 30  # 30 days retention for raw data
  processed_data = 60  # 60 days retention for processed data
  archive        = 90  # 90 days retention for archived data
}

storage_location = "US"
bigquery_dataset_location = "US"

# Network Configuration
network_name    = "pharma-pipeline-dev-vpc"
subnet_ip_cidr  = "10.0.0.0/24"

# Security and Access Configuration
enable_vpc_sc = false  # Disabled for development environment
service_account_id = "pharma-pipeline-dev-sa"

# Monitoring Configuration
enable_monitoring = true
monitoring_notification_channels = []  # Empty for development environment