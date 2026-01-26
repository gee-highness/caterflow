import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'ml4r1dn2',
    dataset: 'production'
  },
  deployment: {
    appId: 'zwnisd9ykpsq2zo8pp6xhf76',
    autoUpdates: true,
  },
})