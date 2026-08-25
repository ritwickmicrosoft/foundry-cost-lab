using './main.bicep'

param environmentName = readEnvironmentVariable('AZURE_ENV_NAME')
param location = readEnvironmentVariable('AZURE_LOCATION')
param operationsAlertEmail = readEnvironmentVariable('OPERATIONS_ALERT_EMAIL', '')
param accessEmailReplyTo = readEnvironmentVariable('ACCESS_EMAIL_REPLY_TO', 'ritwickdutta@microsoft.com')
