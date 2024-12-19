# Project Configuration
project_id = "pharma-pipeline-staging"
environment = "staging"
region = "us-central1"

# Storage Configuration
storage_location = "US"
retention_period_days = {
  raw_data = 90        # 90 days retention for raw scraping data
  processed_data = 180 # 180 days retention for processed documents
  system_logs = 30     # 30 days retention for system logs
  audit_logs = 365     # 1 year retention for audit logs
  archive = 2555       # 7 years retention for archived data
}
bigquery_dataset_location = "US"

# Network Configuration
network_name = "pharma-pipeline-staging-vpc"
subnet_ip_cidr = "10.0.0.0/24"

# Security Configuration
enable_vpc_sc = true
service_account_id = "pharma-pipeline-staging-sa"

# Service Configuration - Cloud Run Scaling Parameters
scraping_min_instances = 0
scraping_max_instances = 10
processing_min_instances = 1
processing_max_instances = 20
api_min_instances = 2
api_max_instances = 30

# Resource Allocation
service_cpu_limits = {
  scraping = "2"    # 2 vCPU for scraping service
  processing = "4"  # 4 vCPU for processing service
  api = "2"         # 2 vCPU for API service
}

service_memory_limits = {
  scraping = "4Gi"  # 4GB memory for scraping service
  processing = "8Gi" # 8GB memory for processing service
  api = "4Gi"       # 4GB memory for API service
}

# Monitoring and Alerting
enable_monitoring = true
enable_auto_rollback = true
monitoring_notification_channels = [
  "staging-alerts-email",
  "staging-alerts-pagerduty"
]

# Resource Labels
labels = {
  environment = "staging"
  managed-by = "terraform"
  project = "pharma-pipeline"
}

# Deployment Strategy
deployment_strategy = {
  type = "blue-green"
  timeout = "600s"
  min_ready_seconds = 30
  max_surge = "100%"
  max_unavailable = "0%"
}

# Security Controls
security_controls = {
  enable_cloud_armor = true
  enable_binary_authorization = true
  enable_container_scanning = true
  enable_audit_logging = true
}

# Data Protection
data_protection = {
  enable_cmek = true
  enable_backup = true
  enable_point_in_time_recovery = true
}

# Compliance Settings
compliance_settings = {
  enable_audit_logs = true
  enable_data_lineage = true
  enable_data_classification = true
}