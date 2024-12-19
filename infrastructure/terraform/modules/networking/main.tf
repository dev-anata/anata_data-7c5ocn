# Provider configuration
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

# Main VPC network
resource "google_compute_network" "main" {
  name                            = "${var.environment}-vpc"
  project                         = var.project_id
  auto_create_subnetworks        = false
  routing_mode                   = "GLOBAL"
  delete_default_routes_on_create = true
  description                    = "Main VPC network for Pharmaceutical Data Pipeline Platform"
}

# Primary subnet in primary region
resource "google_compute_subnetwork" "primary" {
  name                     = "${var.environment}-${var.region}-subnet"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range           = var.primary_subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = var.flow_logs_sampling
    metadata             = "INCLUDE_ALL_METADATA"
  }

  secondary_ip_range {
    range_name    = "${var.environment}-${var.region}-pods"
    ip_cidr_range = "192.168.0.0/20"
  }

  secondary_ip_range {
    range_name    = "${var.environment}-${var.region}-services"
    ip_cidr_range = "192.168.16.0/20"
  }
}

# DR subnet in DR region
resource "google_compute_subnetwork" "dr" {
  name                     = "${var.environment}-${var.dr_region}-subnet"
  project                  = var.project_id
  region                   = var.dr_region
  network                  = google_compute_network.main.id
  ip_cidr_range           = var.dr_subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = var.flow_logs_sampling
    metadata             = "INCLUDE_ALL_METADATA"
  }

  secondary_ip_range {
    range_name    = "${var.environment}-${var.dr_region}-pods"
    ip_cidr_range = "192.168.32.0/20"
  }

  secondary_ip_range {
    range_name    = "${var.environment}-${var.dr_region}-services"
    ip_cidr_range = "192.168.48.0/20"
  }
}

# Cloud Router for NAT gateway
resource "google_compute_router" "router" {
  name    = "${var.environment}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.main.id

  bgp {
    asn = 64514
  }
}

# Cloud NAT configuration
resource "google_compute_router_nat" "nat" {
  name                               = "${var.environment}-nat"
  project                           = var.project_id
  router                            = google_compute_router.router.name
  region                            = var.region
  nat_ip_allocate_option           = var.nat_ip_allocate_option
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Private service access configuration
resource "google_compute_global_address" "private_ip_address" {
  name          = "${var.environment}-private-ip"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.private_ip_prefix_length
  network       = google_compute_network.main.id
}

# VPC service networking connection
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# Firewall rules
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.environment}-allow-internal"
  project = var.project_id
  network = google_compute_network.main.id

  direction = "INGRESS"
  priority  = 1000

  source_ranges = [var.primary_subnet_cidr, var.dr_subnet_cidr]

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }
}

resource "google_compute_firewall" "allow_health_checks" {
  name    = "${var.environment}-allow-health-checks"
  project = var.project_id
  network = google_compute_network.main.id

  direction = "INGRESS"
  priority  = 1000

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "deny_all_ingress" {
  name    = "${var.environment}-deny-all-ingress"
  project = var.project_id
  network = google_compute_network.main.id

  direction = "INGRESS"
  priority  = 65535

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
}

# Outputs for use by other modules
output "vpc_network" {
  description = "The VPC network resource"
  value = {
    id   = google_compute_network.main.id
    name = google_compute_network.main.name
  }
}

output "subnets" {
  description = "The created subnet resources"
  value = {
    primary = google_compute_subnetwork.primary
    dr      = google_compute_subnetwork.dr
  }
}