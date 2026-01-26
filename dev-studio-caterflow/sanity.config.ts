import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemaTypes'
import { FaBoxes, FaCube, FaTag, FaClipboardList, FaUsers } from 'react-icons/fa'
import MyLogo from './schemaTypes/logo'

export default defineConfig({
  name: 'default',
  title: 'Caterflow by Synapse',

    projectId: 'ml4r1dn2',
  dataset: 'production',


  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            // Core Data Management
            S.listItem()
              .title('Master Data')
              .icon(FaBoxes)
              .child(
                S.list()
                  .title('Master Data')
                  .items([
                    S.documentTypeListItem('Site').title('Sites'),
                    S.documentTypeListItem('Bin').title('Storage Bins'),
                    S.documentTypeListItem('Category').title('Categories'),
                    // --- START MODIFICATION FOR STOCKITEM FILTERING ---
                    S.listItem() // This creates the "All Stock Items" + "Stock Items by Category" group
                      .title('Stock Items')
                      .icon(FaCube) // Icon for the Stock Items section
                      .child(
                        S.list()
                          .title('Stock Items')
                          .items([
                            // 1. Show all Stock Items first
                            S.documentTypeListItem('StockItem').title('All Stock Items'),
                            S.divider(), // Separator

                            // 2. Dynamically list Categories and filter Stock Items by each
                            S.listItem()
                              .title('Stock Items by Category')
                              .icon(FaTag) // Icon for the category filter section
                              .child(
                                // Query all Category documents to create a list of them
                                S.documentTypeList('Category')
                                  .title('By Category')
                                  .filter('_type == "Category"') // Ensure we're only getting Categories
                                  .child((categoryId) =>
                                    // For each Category, create a document list of StockItems
                                    // filtered by that category's _id
                                    S.documentList()
                                      .title('Items in Category')
                                      .filter(
                                        '_type == "StockItem" && category._ref == $categoryId'
                                      )
                                      .params({ categoryId })
                                  )
                              ),
                          ])
                      ),
                    // --- END MODIFICATION FOR STOCKITEM FILTERING ---
                    S.documentTypeListItem('Supplier').title('Suppliers'),
                  ])
              ),
            S.divider(),

            // Transactions & Logs
            S.listItem()
              .title('Inventory Transactions')
              .icon(FaClipboardList)
              .child(
                S.list()
                  .title('Inventory Transactions')
                  .items([
                    S.documentTypeListItem('PurchaseOrder').title('Purchase Orders'),
                    S.documentTypeListItem('GoodsReceipt').title('Goods Receipts'),
                    S.documentTypeListItem('DispatchLog').title('Dispatch Logs'),
                    S.documentTypeListItem('InternalTransfer').title('Internal Transfers'),
                    S.documentTypeListItem('StockAdjustment').title('Stock Adjustments'),
                    S.documentTypeListItem('InventoryCount').title('Inventory Counts'),
                  ])
              ),
            S.divider(),

            // User & System Management
            S.listItem()
              .title('System Administration')
              .icon(FaUsers)
              .child(
                S.list()
                  .title('System Administration')
                  .items([
                    S.documentTypeListItem('AppUser').title('App Users'),
                    S.documentTypeListItem('NotificationPreference').title('Notification Preferences'),
                  ])
              ),
          ])
    }),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
  studio: {
    components: {
      logo: MyLogo,
    },
  },
});