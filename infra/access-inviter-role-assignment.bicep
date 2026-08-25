targetScope = 'resourceGroup'

@description('Static Web App that receives approved role invitations.')
param staticWebAppName string

@description('Managed identity principal that creates approved invitations.')
param principalId string

@description('Subscription custom role containing Static Web App read and create-invitation actions.')
param roleDefinitionId string

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' existing = {
  name: staticWebAppName
}

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: staticWebApp
  name: guid(staticWebApp.id, principalId, roleDefinitionId)
  properties: {
    roleDefinitionId: roleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
    description: 'Allows approved access requests to create costlab-user invitation links.'
  }
}
