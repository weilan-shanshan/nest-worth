// PM2 进程描述。
// 启动：pm2 start ecosystem.config.cjs
// 环境变量从同目录 .env 加载（见 src/index.ts 顶部的 dotenv/config）
module.exports = {
  apps: [
    {
      name: 'nestworth-analytics',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      // Sprint 0-3 商业化后含 jose + nodemailer + tencentcloud-sdk + bailian-analyst
      // 实测峰值 ~250MB；500M 留 2x 缓冲，超过自动重启防 OOM
      max_memory_restart: '500M',
      out_file: 'logs/out.log',
      error_file: 'logs/err.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
