targetScope = 'resourceGroup'

param location string
param nameToken string
param storageAccountResourceId string
param tags object

var virtualNetworkName = 'vnet-foundry-cost-${nameToken}'
var functionSubnetName = 'snet-functions'
var privateEndpointSubnetName = 'snet-private-endpoints'
var privateEndpointName = 'pep-foundry-cost-storage-${nameToken}'
var blobPrivateDnsZoneName = 'privatelink.blob.${environment().suffixes.storage}'

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: virtualNetworkName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.40.0.0/24'
      ]
    }
    subnets: [
      {
        name: functionSubnetName
        properties: {
          addressPrefix: '10.40.0.0/27'
          delegations: [
            {
              name: 'flex-consumption'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: privateEndpointSubnetName
        properties: {
          addressPrefix: '10.40.0.32/28'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource functionSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: virtualNetwork
  name: functionSubnetName
}

resource privateEndpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: virtualNetwork
  name: privateEndpointSubnetName
}

resource blobPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: blobPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource blobPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: blobPrivateDnsZone
  name: 'link-${virtualNetworkName}'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource blobPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: privateEndpointName
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: '${privateEndpointName}-connection'
        properties: {
          privateLinkServiceId: storageAccountResourceId
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource blobPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: blobPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: blobPrivateDnsZone.id
        }
      }
    ]
  }
}

output functionSubnetResourceId string = functionSubnet.id
output blobPrivateEndpointResourceId string = blobPrivateEndpoint.id
