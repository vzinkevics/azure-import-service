# Configure the Azure provider
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.85.0"
    }
  }

  required_version = ">= 1.1.0"
}

provider "azurerm" {
  features {
    api_management {
      purge_soft_delete_on_destroy = true
    }
  }
}

resource "azurerm_resource_group" "import_service_rg" {
  location = "northeurope"
  name     = "rg-import-service-sand-ne-003"
}

resource "azurerm_storage_account" "import_service_fa" {
  name     = "stgsangimportfane889"
  location = "northeurope"

  account_replication_type = "LRS"
  account_tier             = "Standard"
  account_kind             = "StorageV2"

  resource_group_name = azurerm_resource_group.import_service_rg.name

  allow_nested_items_to_be_public = true
  shared_access_key_enabled       = true
  public_network_access_enabled   = true
  blob_properties {
    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD", "POST", "OPTIONS", "PUT"]
      allowed_origins    = ["*"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 3660
    }
  }
}

resource "azurerm_storage_share" "import_service_storage_share" {
  name  = "fa-import-service-share"
  quota = 2

  storage_account_name = azurerm_storage_account.import_service_fa.name
}

resource "azurerm_storage_share" "import_service_storage_share_slot" {
  name  = "fa-import-service-share-slot"
  quota = 2

  storage_account_name = azurerm_storage_account.import_service_fa.name
}

resource "azurerm_service_plan" "import_service_plan" {
  name     = "asp-import-service-sand-ne-001"
  location = "northeurope"

  os_type  = "Windows"
  sku_name = "Y1"

  resource_group_name = azurerm_resource_group.import_service_rg.name
}

resource "azurerm_application_insights" "import_service_fa" {
  name             = "appins-fa-import-service-sand-ne-001"
  application_type = "web"
  location         = "northeurope"


  resource_group_name = azurerm_resource_group.import_service_rg.name
}

data "azurerm_servicebus_namespace" "service_bus_namespace" {
  name                          = "service-bus-sand-ne-003"
  resource_group_name           = "rg-service-bus-sand-ne-003"
}

resource "azurerm_windows_function_app" "import_service_new" {
  name     = "fa-import-service-ne-659"
  location = "northeurope"

  service_plan_id     = azurerm_service_plan.import_service_plan.id
  resource_group_name = azurerm_resource_group.import_service_rg.name

  storage_account_name       = azurerm_storage_account.import_service_fa.name
  storage_account_access_key = azurerm_storage_account.import_service_fa.primary_access_key

  functions_extension_version = "~4"
  builtin_logging_enabled     = false

  site_config {
    always_on = false

    application_insights_key               = azurerm_application_insights.import_service_fa.instrumentation_key
    application_insights_connection_string = azurerm_application_insights.import_service_fa.connection_string

    # For production systems set this to false
    use_32_bit_worker = false

    # Enable function invocations from Azure Portal.
    cors {
      allowed_origins = [
        "https://portal.azure.com",
        "https://stgsandfrontendne889.z16.web.core.windows.net/"
      ]
    }

    application_stack {
      node_version = "~16"
    }
  }

  app_settings = {
    WEBSITE_CONTENTAZUREFILECONNECTIONSTRING = azurerm_storage_account.import_service_fa.primary_connection_string
    WEBSITE_CONTENTSHARE                     = azurerm_storage_share.import_service_storage_share.name
    "ServiceBusConnection"                   = data.azurerm_servicebus_namespace.service_bus_namespace.default_primary_connection_string
  }

  # The app settings changes cause downtime on the Function App. e.g. with Azure Function App Slots
  # Therefore it is better to ignore those changes and manage app settings separately off the Terraform.
  lifecycle {
    ignore_changes = [
      app_settings,
      tags["hidden-link: /app-insights-instrumentation-key"],
      tags["hidden-link: /app-insights-resource-id"],
      tags["hidden-link: /app-insights-conn-string"]
    ]
  }
}

resource "azurerm_storage_container" "storage_container_uploaded" {
  name                  = "uploaded"
  storage_account_name  = azurerm_storage_account.import_service_fa.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "storage_container_parsed" {
  name                  = "parsed"
  storage_account_name  = azurerm_storage_account.import_service_fa.name
  container_access_type = "private"
}

resource "azurerm_api_management_api" "import_service_api" {
  name                = "import-service-api"
  api_management_name = "products-service-apim" // reuse existing apim
  resource_group_name = "rg-apim-sand-ne-001"
  revision            = "1"
  display_name        = "Import Service API"
  protocols           = ["https"]
  path                = "container"
  subscription_required = true
  subscription_key_parameter_names {
    header = "Ocp-Apim-Subscription-Key"
    query  = "subscription-key"
  }
}

data "azurerm_function_app_host_keys" "importServiceHostKeys" {
  name                = azurerm_windows_function_app.import_service_new.name
  resource_group_name = azurerm_resource_group.import_service_rg.name
}

resource "azurerm_api_management_named_value" "importServiceDefaultKey" {
  name                = "importServiceDefaultKey"
  resource_group_name = "rg-apim-sand-ne-001"
  api_management_name = "products-service-apim"
  display_name        = "funcImportDefaultKey"
  secret              = true
  value               = data.azurerm_function_app_host_keys.importServiceHostKeys.default_function_key
}

resource "azurerm_api_management_api_policy" "payment_service_api_policy" {
  api_name            = azurerm_api_management_api.import_service_api.name
  api_management_name = "products-service-apim"
  resource_group_name = "rg-apim-sand-ne-001"

  xml_content = <<XML
    <policies>
      <inbound>
          <set-backend-service base-url="https://fa-import-service-ne-659.azurewebsites.net" />
          <set-header name="x-functions-key" exists-action="override">
            <value>{{funcImportDefaultKey}}</value>
          </set-header>
          <base/>
          <cors allow-credentials="false">
            <allowed-origins>
                <origin>*</origin>
            </allowed-origins>
            <allowed-methods>
                <method>GET</method>
                <method>POST</method>
                <method>PUT</method>
            </allowed-methods>
            <allowed-headers>
                <header>*</header>
            </allowed-headers>
            <expose-headers>
                <header>*</header>
            </expose-headers>
          </cors>
      </inbound>
      <backend>
          <base/>
      </backend>
      <outbound>
          <base/>
      </outbound>
      <on-error>
          <base/>
      </on-error>
   </policies>
  XML
}

resource "azurerm_api_management_api_operation" "get_import_product_files" {
  operation_id        = "get-import-product-files"
  api_name            = azurerm_api_management_api.import_service_api.name
  api_management_name = "products-service-apim"
  resource_group_name = "rg-apim-sand-ne-001"
  display_name        = "Get Import Product Files"
  method              = "GET"
  url_template        = "/api/import"
}
