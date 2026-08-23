targetScope = 'resourceGroup'

param location string
param actionGroupName string
param nameToken string
param applicationInsightsResourceId string
param operationsAlertEmail string = ''
param tags object

resource monitorActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'CostLab'
    enabled: true
    emailReceivers: empty(operationsAlertEmail) ? [] : [
      {
        name: 'Foundry Cost Lab operations'
        emailAddress: operationsAlertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource morningSyncFailureAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = {
  name: 'alert-foundry-cost-sync-failure-${nameToken}'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Foundry Cost Lab morning synchronization failed'
    description: 'A regional CAD rate or Foundry catalog refresh failed. Successful last-good snapshots remain active.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT15M'
    windowSize: 'PT1H'
    scopes: [
      applicationInsightsResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''
traces
| where message startswith "MORNING_SYNC_FAILURE"
'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        monitorActionGroup.id
      ]
    }
    autoMitigate: true
    checkWorkspaceAlertsStorageConfigured: false
    skipQueryValidation: false
  }
}

resource missedMorningSyncAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = {
  name: 'alert-foundry-cost-sync-missed-${nameToken}'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Foundry Cost Lab morning synchronization missing'
    description: 'No complete morning synchronization heartbeat has been observed in the last 36 hours.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT1H'
    windowSize: 'P2D'
    scopes: [
      applicationInsightsResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''
let FirstTelemetry = toscalar(
  union isfuzzy=true traces, requests
  | summarize min(timestamp)
);
let Successes = toscalar(
  traces
  | where timestamp > ago(36h)
  | where message startswith "MORNING_SYNC_SUCCESS"
  | summarize count()
);
print FirstTelemetry, Successes
| where FirstTelemetry < ago(36h) and Successes == 0
'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        monitorActionGroup.id
      ]
    }
    autoMitigate: true
    checkWorkspaceAlertsStorageConfigured: false
    skipQueryValidation: false
  }
}
