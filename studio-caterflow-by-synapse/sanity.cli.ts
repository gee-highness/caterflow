import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'v3sfsmld',
    dataset: 'production'
  },
  deployment: {
    appId: 'zwnisd9ykpsq2zo8pp6xhf76',
    autoUpdates: true,
  },
})