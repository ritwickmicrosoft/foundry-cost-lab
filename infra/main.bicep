targetScope = 'subscription'

@minLength(1)
@maxLength(32)
@description('Short azd environment name used to produce deterministic resource names.')
param environmentName string

@allowed([
  'canadacentral'
  'eastus2'
])
@metadata({
  azd: {
    type: 'location'
  }
})
@description('Azure region for Function, storage, and monitoring resources. Cost-card regions remain independently selectable in the application.')
param location string

@allowed([
  'eastus2'
  'westus2'
  'centralus'
  'westeurope'
  'eastasia'
])
@description('Supported control-plane region for the globally distributed Static Web App.')
param staticWebAppLocation string = 'eastus2'

@description('Optional operations email for failed or missed morning synchronization alerts.')
param operationsAlertEmail string = ''

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var shortToken = take(resourceToken, 12)
var resourceGroupName = 'rg-foundry-cost-${environmentName}'
var identityName = 'id-foundry-cost-${shortToken}'
var storageAccountName = 'st${take(resourceToken, 20)}'
var appServicePlanName = 'plan-foundry-cost-${shortToken}'
var functionAppName = 'func-foundry-cost-${shortToken}'
var logAnalyticsName = 'log-foundry-cost-${shortToken}'
var applicationInsightsName = 'appi-foundry-cost-${shortToken}'
var actionGroupName = 'ag-foundry-cost-${shortToken}'
var staticWebAppName = 'swa-foundry-cost-${shortToken}'
var deploymentStorageContainerName = 'app-package-${shortToken}'
var rateStorageContainerName = 'rate-cards'
var tags = {
  'azd-env-name': environmentName
  application: 'foundry-cost-lab'
  dataClassification: 'internal'
}

module resourceGroup 'br/public:avm/res/resources/resource-group:0.4.4' = {
  params: {
    name: resourceGroupName
    location: location
    tags: tags
  }
}

module functionIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.6.0' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    name: identityName
    location: location
    tags: tags
  }
  dependsOn: [resourceGroup]
}

resource catalogReaderRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(subscription().id, 'Foundry Cost Lab Model Catalog Reader')
  properties: {
    roleName: 'Foundry Cost Lab Model Catalog Reader'
    description: 'Reads regional Microsoft Foundry model availability for dated catalog snapshots.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.CognitiveServices/locations/models/read'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
    assignableScopes: [
      subscription().id
    ]
  }
}

resource catalogReaderAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, identityName, catalogReaderRole.name)
  properties: {
    roleDefinitionId: catalogReaderRole.id
    principalId: functionIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    description: 'Allows the daily Function job to read only regional Foundry model metadata.'
  }
}

module storage 'br/public:avm/res/storage/storage-account:0.33.0' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    name: storageAccountName
    location: location
    tags: tags
    skuName: 'Standard_LRS'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Disabled'
    requireInfrastructureEncryption: true
    blobServices: {
      containerDeleteRetentionPolicyEnabled: true
      containerDeleteRetentionPolicyDays: 14
      deleteRetentionPolicyEnabled: true
      deleteRetentionPolicyDays: 14
      isVersioningEnabled: true
      containers: [
        {
          name: deploymentStorageContainerName
          publicAccess: 'None'
        }
        {
          name: rateStorageContainerName
          publicAccess: 'None'
        }
      ]
    }
    roleAssignments: [
      {
        principalId: functionIdentity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: 'Storage Blob Data Owner'
        description: 'Function host, deployment package, and rate-card snapshot access.'
      }
    ]
  }
}

module networking './networking.bicep' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    location: location
    nameToken: shortToken
    storageAccountResourceId: storage.outputs.resourceId
    tags: tags
  }
  dependsOn: [resourceGroup]
}

module appServicePlan 'br/public:avm/res/web/serverfarm:0.7.0' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    name: appServicePlanName
    location: location
    tags: tags
    kind: 'linux'
    reserved: true
    skuName: 'FC1'
  }
  dependsOn: [resourceGroup]
}

module logAnalytics 'br/public:avm/res/operational-insights/workspace:0.16.1' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    name: logAnalyticsName
    location: location
    tags: tags
    dataRetention: 30
    dailyQuotaGb: '0.5'
    features: {
      disableLocalAuth: true
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    forceCmkForQuery: false
  }
  dependsOn: [resourceGroup]
}

module applicationInsights 'br/public:avm/res/insights/component:0.8.0' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    name: applicationInsightsName
    location: location
    tags: tags
    workspaceResourceId: logAnalytics.outputs.resourceId
    disableLocalAuth: true
    retentionInDays: 30
    samplingPercentage: 100
    roleAssignments: [
      {
        principalId: functionIdentity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: 'Monitoring Metrics Publisher'
      }
    ]
  }
}

module monitoring './monitoring.bicep' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    location: location
    actionGroupName: actionGroupName
    nameToken: shortToken
    applicationInsightsResourceId: applicationInsights.outputs.resourceId
    operationsAlertEmail: operationsAlertEmail
    tags: tags
  }
  dependsOn: [resourceGroup]
}

var functionAppSettings = {
  AzureWebJobsStorage__blobServiceUri: storage.outputs.primaryBlobEndpoint
  AzureWebJobsStorage__credential: 'managedidentity'
  AzureWebJobsStorage__clientId: functionIdentity.outputs.clientId
  APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.outputs.connectionString
  APPLICATIONINSIGHTS_AUTHENTICATION_STRING: 'ClientId=${functionIdentity.outputs.clientId};Authorization=AAD'
  FUNCTIONS_EXTENSION_VERSION: '~4'
  AZURE_CLIENT_ID: functionIdentity.outputs.clientId
  AZURE_SUBSCRIPTION_ID: subscription().subscriptionId
  RATE_STORAGE_ACCOUNT_URL: storage.outputs.primaryBlobEndpoint
  RATE_STORAGE_CONTAINER: rateStorageContainerName
}

module functionApp 'br/public:avm/res/web/site:0.24.0' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    name: functionAppName
    location: location
    kind: 'functionapp,linux'
    serverFarmResourceId: appServicePlan.outputs.resourceId
    tags: union(tags, { 'azd-service-name': 'api' })
    managedIdentities: {
      userAssignedResourceIds: [functionIdentity.outputs.resourceId]
    }
    virtualNetworkSubnetResourceId: networking.outputs.functionSubnetResourceId
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.outputs.primaryBlobEndpoint}${deploymentStorageContainerName}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: functionIdentity.outputs.resourceId
          }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 2048
        maximumInstanceCount: 10
      }
      runtime: {
        name: 'node'
        version: '22'
      }
    }
    siteConfig: {
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
    configs: [
      {
        name: 'appsettings'
        properties: functionAppSettings
      }
    ]
    publicNetworkAccess: 'Enabled'
    basicPublishingCredentialsPolicies: [
      {
        name: 'ftp'
        allow: false
      }
      {
        name: 'scm'
        allow: false
      }
    ]
  }
}

module staticWebApp 'br/public:avm/res/web/static-site:0.9.5' = {
  scope: az.resourceGroup(resourceGroupName)
  params: {
    name: staticWebAppName
    location: staticWebAppLocation
    tags: union(tags, { 'azd-service-name': 'web' })
    sku: 'Standard'
    stagingEnvironmentPolicy: 'Disabled'
    publicNetworkAccess: 'Enabled'
    allowConfigFileUpdates: true
    linkedBackend: {
      resourceId: functionApp.outputs.resourceId
      location: location
    }
  }
}

output APPLICATIONINSIGHTS_CONNECTION_STRING string = applicationInsights.outputs.connectionString
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output SERVICE_API_NAME string = functionApp.outputs.name
output SERVICE_WEB_NAME string = staticWebApp.outputs.name
output STATIC_WEB_APP_URL string = 'https://${staticWebApp.outputs.defaultHostname}'
