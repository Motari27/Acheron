// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'acheron',
      script: 'main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
