module.exports = {
  apps: [{
    name: 'vote26',
    script: 'npx',
    args: 'serve -s dist -l 3026',
    cwd: '/root/vote_app/vote26/art-battle-vote',
    env: {
      NODE_ENV: 'production'
    }
  }]
};