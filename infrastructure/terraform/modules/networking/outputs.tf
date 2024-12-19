# Core VPC outputs
output "vpc_id" {
  description = "The ID of the VPC network for service deployment and resource association"
  value       = google_compute_network.main.id
}

output "vpc_name" {
  description = "The name of the VPC network for resource naming and reference"
  value       = google_compute_network.main.name
}

output "vpc_self_link" {
  description = "The self-link of the VPC network for resource association"
  value       = google_compute_network.main.self_link
}

# Subnet outputs
output "primary_subnet" {
  description = "The primary subnet resource containing network configuration for the primary region"
  value = {
    id                = google_compute_subnetwork.primary.id
    name              = google_compute_subnetwork.primary.name
    region            = google_compute_subnetwork.primary.region
    ip_cidr_range     = google_compute_subnetwork.primary.ip_cidr_range
    secondary_ranges  = {
      pods      = google_compute_subnetwork.primary.secondary_ip_range[0]
      services  = google_compute_subnetwork.primary.secondary_ip_range[1]
    }
  }
}

output "dr_subnet" {
  description = "The disaster recovery subnet resource containing network configuration for the DR region"
  value = {
    id                = google_compute_subnetwork.dr.id
    name              = google_compute_subnetwork.dr.name
    region            = google_compute_subnetwork.dr.region
    ip_cidr_range     = google_compute_subnetwork.dr.ip_cidr_range
    secondary_ranges  = {
      pods      = google_compute_subnetwork.dr.secondary_ip_range[0]
      services  = google_compute_subnetwork.dr.secondary_ip_range[1]
    }
  }
}

# Networking components outputs
output "router_id" {
  description = "The ID of the Cloud Router for NAT and routing configuration"
  value       = google_compute_router.router.id
}

output "router_name" {
  description = "The name of the Cloud Router for NAT and routing configuration"
  value       = google_compute_router.router.name
}

output "nat_name" {
  description = "The name of the Cloud NAT gateway"
  value       = google_compute_router_nat.nat.name
}

output "nat_ip_addresses" {
  description = "The list of NAT IP addresses for external connectivity"
  value       = google_compute_router_nat.nat.nat_ips
}

# Private service access outputs
output "private_vpc_connection" {
  description = "The private VPC connection for service networking"
  value       = google_service_networking_connection.private_vpc_connection.id
}

output "private_ip_address" {
  description = "The allocated private IP address range for service networking"
  value = {
    name    = google_compute_global_address.private_ip_address.name
    address = google_compute_global_address.private_ip_address.address
    purpose = google_compute_global_address.private_ip_address.purpose
  }
}

# Network security outputs
output "firewall_rules" {
  description = "The created firewall rules for network security"
  value = {
    allow_internal = {
      name = google_compute_firewall.allow_internal.name
      id   = google_compute_firewall.allow_internal.id
    }
    allow_health_checks = {
      name = google_compute_firewall.allow_health_checks.name
      id   = google_compute_firewall.allow_health_checks.id
    }
    deny_all_ingress = {
      name = google_compute_firewall.deny_all_ingress.name
      id   = google_compute_firewall.deny_all_ingress.id
    }
  }
}

# Composite outputs for common use cases
output "network_info" {
  description = "Combined network information for service deployment"
  value = {
    vpc = {
      id         = google_compute_network.main.id
      name       = google_compute_network.main.name
      self_link  = google_compute_network.main.self_link
    }
    primary_region = {
      subnet     = google_compute_subnetwork.primary.name
      cidr      = google_compute_subnetwork.primary.ip_cidr_range
    }
    dr_region = {
      subnet     = google_compute_subnetwork.dr.name
      cidr      = google_compute_subnetwork.dr.ip_cidr_range
    }
    nat = {
      name      = google_compute_router_nat.nat.name
      router    = google_compute_router.router.name
    }
  }
}