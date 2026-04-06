const initSqlJs = require(require('path').join(__dirname, '..', 'src', 'node_modules', 'sql.js'));
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  // Get max sort_order
  const maxSort = db.exec('SELECT MAX(sort_order) FROM backlog_tickets');
  let sortOrder = (maxSort[0].values[0][0] || 0) + 1;

  const featureRef = '.ombutocode/features/feature_DEPLOYMENT_INFRASTRUCTURE.md';
  const lastUpdated = '2026-03-26';

  const tickets = [
    {
      id: 'INFRA-001',
      data: {
        title: 'Terraform: Implement all AWS infrastructure modules',
        description: 'Create Terraform modules for the complete Oshili Doc AWS infrastructure in af-south-1. This includes VPC, EC2 (t3.medium), EBS volumes, Elastic IP, S3 buckets (practice portal, admin console, backups), 4 CloudFront distributions (app, api, practice, admin), Route 53 DNS, ACM certificate (us-east-1 SAN cert), SSM Parameter Store secrets, CloudWatch alarms + SNS, and DLM backup policy. Terraform state stored in S3 with DynamoDB locking.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-006'],
        acceptance_criteria: [
          'terraform/ directory contains: main.tf, variables.tf, outputs.tf, vpc.tf, ec2.tf, s3.tf, cloudfront.tf, route53.tf, acm.tf, ssm.tf, monitoring.tf, backup.tf, versions.tf',
          'terraform plan runs without errors',
          'terraform apply provisions all resources in af-south-1',
          'EC2 t3.medium instance created with 30GB root + 20GB data EBS volumes',
          'Elastic IP attached to EC2',
          'Security group allows port 80 from CloudFront prefix list only, port 1194/UDP from anywhere, port 22 from VPN subnet 10.8.0.0/24 only',
          '2 S3 buckets created: oshili-practice-portal, oshili-admin-console (public access blocked, OAI only)',
          '1 S3 backup bucket: oshili-backups with 30-day lifecycle policy',
          '4 CloudFront distributions created with correct origins and behaviors',
          'Route 53 hosted zone with CNAME records for app, api, practice, admin, vpn, www',
          'ACM SAN certificate in us-east-1 covering all 4 subdomains, DNS-validated',
          'SSM Parameter Store entries created for all secrets',
          'CloudWatch alarms for CPU, status check, disk, memory with SNS topic',
          'DLM policy for daily EBS snapshots (7 daily, 4 weekly retention)',
          'State backend configured for S3 + DynamoDB locking',
          'terraform.tfvars is in .gitignore'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 8: Terraform)\n\nModule structure:\n  terraform/main.tf - Provider config (af-south-1 + us-east-1 alias for ACM), S3 backend\n  terraform/variables.tf - region, instance_type, domain, vpc_cidr, db passwords, etc.\n  terraform/outputs.tf - EC2 IP, CloudFront URLs, S3 bucket names\n  terraform/vpc.tf - VPC, public subnet, IGW, route table, security group\n  terraform/ec2.tf - aws_instance, aws_ebs_volume, aws_eip, aws_iam_role, aws_iam_instance_profile, user data script\n  terraform/s3.tf - 3 buckets (practice, admin, backups) with policies and lifecycle\n  terraform/cloudfront.tf - 4 distributions: practice+admin (S3+API origins), app+api (EC2 origin), OAI\n  terraform/route53.tf - Hosted zone, CNAME records\n  terraform/acm.tf - SAN cert in us-east-1, DNS validation records\n  terraform/ssm.tf - Parameter Store entries\n  terraform/monitoring.tf - CloudWatch alarms, SNS topic\n  terraform/backup.tf - DLM lifecycle policy\n  terraform/versions.tf - Required providers\n\nBootstrap (manual): S3 bucket oshili-terraform-state + DynamoDB table oshili-terraform-locks\n\nCloudFront security group trick: use aws_ec2_managed_prefix_list data source for com.amazonaws.global.cloudfront.origin-facing',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-002',
      data: {
        title: 'Docker: Create production docker-compose.prod.yml',
        description: 'Create a production-ready docker-compose.prod.yml for the EC2 instance. Consolidates PostgreSQL into a single container with two databases (gateway, mymed). Includes Nginx (HTTP only, port 80), Nuxt SSR frontend, Gateway, Mymed, Consul, and consul-config-loader. All services use restart: unless-stopped, health checks, and the oshili-net bridge network. PostgreSQL data mounted on EBS at /data/postgres. Environment variables sourced from .env file (loaded from SSM).',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-003', 'INFRA-005'],
        acceptance_criteria: [
          'docker-compose.prod.yml exists at project root or docker-compose/ directory',
          'Single PostgreSQL container serves both gateway and mymed databases via init script',
          'PostgreSQL data directory mounted at /data/postgres (EBS volume)',
          'Nginx container listens on port 80 only (no SSL, CloudFront handles HTTPS)',
          'Nuxt SSR container built from frontend/Dockerfile',
          'Gateway and Mymed containers use JIB-built images with -Xmx384m -Xms192m',
          'Consul and consul-config-loader configured for service discovery',
          'All services have restart: unless-stopped policy',
          'All services have health checks defined',
          'All services on oshili-net bridge network',
          'Environment variables loaded from .env file',
          'docker compose up -d starts all services successfully',
          'PostgreSQL init script creates both databases on first run'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 4: Docker & Services)\n\nServices:\n  nginx - nginx:alpine, port 80 exposed, routes / -> nuxt:3000, /api/** -> gateway:8080\n  nuxt-frontend - custom Dockerfile (see INFRA-003), port 3000\n  gateway - JIB image eclipse-temurin:21-jre-noble, port 8080, JVM -Xmx384m -Xms192m\n  mymed - JIB image, port 8081, JVM -Xmx384m -Xms192m\n  consul - hashicorp/consul:1.22.3, port 8500 (internal only)\n  consul-config-loader - loads central-server-config\n  postgresql - postgres:18.1, port 5432 (internal only), volumes: /data/postgres\n\nPostgreSQL init script (docker-entrypoint-initdb.d/):\n  CREATE DATABASE gateway;\n  CREATE DATABASE mymed;\n\nDifferences from dev docker-compose.yml:\n  - Single PostgreSQL instead of two\n  - Nginx added\n  - Nuxt SSR added\n  - JVM heap reduced to 384m\n  - restart policies\n  - health checks\n  - .env file for secrets',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-003',
      data: {
        title: 'Docker: Create Nuxt SSR Dockerfile for frontend',
        description: 'Create a production Dockerfile for the Nuxt 3 SSR frontend. The Dockerfile should use node:22-alpine, copy the pre-built .output/ directory, and run the Nitro server. The image should be minimal and optimised for the t3.medium memory constraints (~150MB target).',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: [],
        acceptance_criteria: [
          'frontend/Dockerfile exists',
          'Uses node:22-alpine as base image',
          'Copies .output/ directory from build context',
          'Sets HOST=0.0.0.0, PORT=3000, NITRO_PORT=3000',
          'Exposes port 3000',
          'CMD runs node .output/server/index.mjs',
          'docker build succeeds from frontend/ directory',
          'Container starts and responds to HTTP requests on port 3000',
          'Image size is under 200MB',
          'Container memory usage is under 200MB at idle'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 4: Service Definitions)\n\nDockerfile:\n  FROM node:22-alpine\n  WORKDIR /app\n  COPY .output/ .output/\n  ENV HOST=0.0.0.0 PORT=3000 NITRO_PORT=3000\n  EXPOSE 3000\n  CMD ["node", ".output/server/index.mjs"]\n\nBuild context assumes npm run build has already been run (by CI/CD pipeline).\nThe .output/ directory contains the complete Nitro server bundle.\n\nFile to create: frontend/Dockerfile',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-004',
      data: {
        title: 'CI/CD: Create .gitlab-ci.yml pipeline with auto-deploy',
        description: 'Create the GitLab CI/CD pipeline configuration for automated build, test, and deployment. Pipeline has 3 stages: build (parallel: gateway, mymed, frontend, practice-portal), test (parallel: gateway, mymed with PostgreSQL services), deploy (app to EC2, practice-portal + admin to S3 with CloudFront invalidation). Triggered on push to main branch. Uses self-hosted shell runner on EC2.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-002', 'INFRA-008'],
        acceptance_criteria: [
          '.gitlab-ci.yml exists at project root',
          'Build stage compiles gateway JAR, mymed JAR, frontend .output/, practice-portal dist/, admin dist/ in parallel',
          'Test stage runs gateway and mymed tests with PostgreSQL service containers',
          'Deploy stage copies JARs and .output/ to /opt/oshili/, runs docker compose build + up',
          'Deploy stage syncs practice-portal dist/ to S3 and invalidates CloudFront cache',
          'Deploy stage syncs admin dist/ to S3 and invalidates CloudFront cache',
          'Pipeline only triggers on push to main branch',
          'Maven cache (.m2/repository) and node_modules are cached between runs',
          'Pipeline uses shell executor (self-hosted runner on EC2)',
          'All pipeline stages complete successfully on a test push'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 7: GitLab CI/CD Pipeline)\n\nStages: build -> test -> deploy\n\nBuild jobs (parallel):\n  build:gateway - cd gateway && ./mvnw verify -DskipTests -Pprod -> artifact gateway/target/*.jar\n  build:mymed - cd mymed && ./mvnw verify -DskipTests -Pprod -> artifact mymed/target/*.jar\n  build:frontend - cd frontend && npm ci && npm run build -> artifact frontend/.output/\n  build:practice-portal - cd frontend-practice && npm ci && npm run build -> artifact frontend-practice/dist/\n\nTest jobs (parallel):\n  test:gateway - PostgreSQL service, ./mvnw verify -Pprod\n  test:mymed - PostgreSQL service, ./mvnw verify -Pprod\n\nDeploy jobs:\n  deploy:app - cp JARs + .output to /opt/oshili, docker compose build + up\n  deploy:practice-portal - aws s3 sync + cloudfront invalidation\n  deploy:admin - aws s3 sync + cloudfront invalidation\n\nRunner: shell executor, concurrency 1, tags: production,oshili\nCache: .m2/repository, frontend/node_modules, frontend-practice/node_modules\n\nFile to create: .gitlab-ci.yml',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-005',
      data: {
        title: 'Docker: Create Nginx reverse proxy config (HTTP only)',
        description: 'Create the Nginx configuration for the production EC2 instance. Nginx runs as an HTTP-only reverse proxy behind CloudFront (which handles HTTPS termination). Routes / to Nuxt SSR (:3000) and /api/** to Gateway (:8080). No SSL configuration needed.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: [],
        acceptance_criteria: [
          'Nginx config file exists (e.g., docker-compose/nginx/nginx.conf or similar)',
          'Listens on port 80 only (no SSL)',
          'Routes / to nuxt-frontend:3000 (proxy_pass)',
          'Routes /api/ to gateway:8080 (proxy_pass)',
          'Proxy headers set correctly (X-Forwarded-For, X-Forwarded-Proto, Host)',
          'X-Forwarded-Proto set to $http_x_forwarded_proto (from CloudFront)',
          'Gzip compression enabled for text, JSON, JavaScript, CSS',
          'Client max body size set appropriately (e.g., 10m)',
          'Access and error logs written to stdout/stderr (for CloudWatch)',
          'Health check endpoint (e.g., /nginx-health) returns 200'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 4: Service Definitions)\n\nNginx serves HTTP only on port 80. CloudFront handles HTTPS termination.\nSecurity group restricts port 80 to CloudFront IP prefix list only.\n\nKey config:\n  server {\n    listen 80;\n    \n    location / {\n      proxy_pass http://nuxt-frontend:3000;\n      proxy_set_header Host $host;\n      proxy_set_header X-Real-IP $remote_addr;\n      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;\n    }\n    \n    location /api/ {\n      proxy_pass http://gateway:8080;\n      proxy_set_header Host $host;\n      proxy_set_header X-Real-IP $remote_addr;\n      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;\n    }\n    \n    location /nginx-health {\n      return 200 "ok";\n    }\n  }\n\nFiles to create: docker-compose/nginx/nginx.conf (or equivalent path)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-006',
      data: {
        title: 'AWS: Account setup, af-south-1 opt-in, and domain registration',
        description: 'Set up the AWS account from scratch following the checklist in the deployment strategy document. Create account, enable MFA, create IAM admin user, opt-in to af-south-1 (Cape Town), register oshilidoc.com domain via Route 53, bootstrap Terraform state backend (S3 bucket + DynamoDB table), and create IAM users for Terraform and GitLab CI/CD.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: [],
        acceptance_criteria: [
          'AWS account created with MFA on root account',
          'IAM admin user created with MFA (not using root for daily ops)',
          'af-south-1 (Cape Town) region enabled and active',
          'oshilidoc.com domain registered via Route 53 (or transferred)',
          'Route 53 hosted zone created for oshilidoc.com',
          'S3 bucket oshili-terraform-state created in af-south-1 with versioning enabled',
          'DynamoDB table oshili-terraform-locks created with LockID partition key',
          'IAM user terraform created with programmatic access and AdministratorAccess',
          'IAM user gitlab-deploy created with scoped policy (S3, CloudFront, SSM read)',
          'AWS CLI configured locally with terraform profile',
          'GitLab CI/CD variables set: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 14: AWS Account Setup Checklist)\n\nThis is a manual ticket - no code changes, all done via AWS Console and CLI.\n\nSteps:\n1. Create AWS account at aws.amazon.com\n2. Enable MFA on root (authenticator app, NOT SMS)\n3. Create IAM admin user, enable MFA\n4. Opt-in af-south-1: Account Settings > Regions > Enable (can take 24hrs)\n5. Register oshilidoc.com via Route 53 (~$12/year)\n6. Create Terraform state bucket: aws s3api create-bucket --bucket oshili-terraform-state --region af-south-1\n7. Create DynamoDB lock table: aws dynamodb create-table --table-name oshili-terraform-locks --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region af-south-1\n8. Create IAM users and configure credentials\n9. ACM cert in us-east-1 (SAN for all subdomains)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-007',
      data: {
        title: 'Security: OpenVPN server setup with EasyRSA PKI',
        description: 'Install and configure OpenVPN Community Edition on the EC2 instance with EasyRSA for certificate-based authentication. VPN subnet 10.8.0.0/24, UDP port 1194. Generate server and initial client certificates. Create .ovpn client config files for admin users. SSH access restricted to VPN subnet only.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-001'],
        acceptance_criteria: [
          'OpenVPN server installed and running on EC2',
          'EasyRSA PKI initialised with CA, server cert, and at least one client cert',
          'OpenVPN listens on UDP port 1194',
          'VPN subnet is 10.8.0.0/24',
          'Client .ovpn config file generated and tested',
          'VPN client can connect and reach EC2 at 10.8.0.1',
          'SSH (port 22) is accessible from 10.8.0.0/24 subnet only',
          'PostgreSQL (port 5432) accessible over VPN for database admin tools',
          'Consul UI (port 8500) accessible over VPN',
          'vpn.oshilidoc.com DNS record points to EC2 Elastic IP',
          'OpenVPN starts automatically on boot (systemd service)'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 12: OpenVPN Access)\n\nInstallation:\n  yum install -y openvpn easy-rsa\n  (or run via Docker: kylemanna/openvpn)\n\nEasyRSA setup:\n  easyrsa init-pki\n  easyrsa build-ca nopass\n  easyrsa gen-req server nopass\n  easyrsa sign-req server server\n  easyrsa gen-dh\n  easyrsa gen-req client1 nopass\n  easyrsa sign-req client client1\n\nServer config (/etc/openvpn/server.conf):\n  port 1194\n  proto udp\n  dev tun\n  server 10.8.0.0 255.255.255.0\n  push "route 172.17.0.0 255.255.0.0"  # Docker network access\n  keepalive 10 120\n  cipher AES-256-GCM\n\nClient .ovpn file: embed CA cert, client cert, client key inline\n\nSecurity group: port 1194/UDP from 0.0.0.0/0, port 22 from 10.8.0.0/24 only',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-008',
      data: {
        title: 'CI/CD: Install and register GitLab Runner on EC2',
        description: 'Install GitLab Runner on the EC2 instance and register it with the GitLab.com project as a shell executor. Set concurrency to 1 to avoid resource contention with the running application. Tag the runner for production deployments.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-001'],
        acceptance_criteria: [
          'GitLab Runner installed on EC2',
          'Runner registered with GitLab.com project using shell executor',
          'Runner tagged with production and oshili tags',
          'Concurrency set to 1 in /etc/gitlab-runner/config.toml',
          'Runner appears as online in GitLab project > Settings > CI/CD > Runners',
          'Runner can execute a test pipeline job successfully',
          'gitlab-runner user has access to Docker commands (docker group)',
          'Runner starts automatically on boot (systemd service)'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 7: GitLab Runner Installation)\n\nInstallation:\n  curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.rpm.sh" | sudo bash\n  sudo yum install -y gitlab-runner\n\nRegistration:\n  sudo gitlab-runner register \\\n    --url https://gitlab.com/ \\\n    --registration-token $GITLAB_REGISTRATION_TOKEN \\\n    --executor shell \\\n    --description "oshili-prod-ec2" \\\n    --tag-list "production,oshili"\n\nConcurrency:\n  sudo sed -i \'s/concurrent = .*/concurrent = 1/\' /etc/gitlab-runner/config.toml\n\nDocker access:\n  sudo usermod -aG docker gitlab-runner\n\nPrerequisites: Docker, Docker Compose, Java 21 (for Maven builds), Node.js 22 (for frontend builds)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-009',
      data: {
        title: 'Monitoring: Configure CloudWatch Agent and custom metrics',
        description: 'Install and configure the CloudWatch Agent on the EC2 instance to collect disk and memory metrics (not available by default). Configure Docker log driver to send container logs to CloudWatch Logs. Set up log groups with 14-day retention.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-001', 'INFRA-002'],
        acceptance_criteria: [
          'CloudWatch Agent installed and running on EC2',
          'Disk space utilization metric available in CloudWatch',
          'Memory utilization metric available in CloudWatch',
          'CloudWatch Logs log groups created: /oshili/nginx, /oshili/gateway, /oshili/mymed, /oshili/frontend',
          'All log groups have 14-day retention policy',
          'Docker containers send logs to CloudWatch Logs',
          'CloudWatch alarms for disk > 80% and memory > 90% trigger SNS notifications',
          'CloudWatch Agent starts automatically on boot'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 11: Monitoring & Alerting)\n\nCloudWatch Agent config (amazon-cloudwatch-agent.json):\n  metrics: disk (used_percent), mem (mem_used_percent)\n  logs: docker container stdout -> CloudWatch Logs\n\nDocker log driver: awslogs\n  docker-compose.prod.yml services should use:\n    logging:\n      driver: awslogs\n      options:\n        awslogs-group: /oshili/<service>\n        awslogs-region: af-south-1\n        awslogs-stream-prefix: oshili\n\nEC2 IAM role needs: logs:PutLogEvents, logs:CreateLogStream, cloudwatch:PutMetricData',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-010',
      data: {
        title: 'Backup: Automated pg_dump scripts and S3 lifecycle policies',
        description: 'Create automated backup scripts for PostgreSQL logical backups (pg_dump) to S3. Set up cron job for daily execution at 04:00 UTC. Configure S3 lifecycle policy for 30-day retention on the backup bucket. Verify backup and restore procedures.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-001', 'INFRA-002'],
        acceptance_criteria: [
          'backup.sh script exists at /opt/oshili/backup.sh',
          'Script dumps both gateway and mymed databases via pg_dump',
          'Dumps are gzipped before upload',
          'Dumps uploaded to s3://oshili-backups/pg/gateway/ and s3://oshili-backups/pg/mymed/',
          'Cron job runs backup.sh daily at 04:00 UTC',
          'S3 lifecycle policy deletes objects older than 30 days in oshili-backups bucket',
          'Backup can be successfully restored to a fresh PostgreSQL instance',
          'Temporary files cleaned up after upload',
          'Script logs success/failure to syslog or CloudWatch'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nReference: shared/docs/deployment_and_infrastructure.md (Section 10: Backup & Disaster Recovery)\n\nScript: /opt/oshili/backup.sh\n  #!/bin/bash\n  DATE=$(date +%Y-%m-%d)\n  docker exec postgresql pg_dump -U gateway gateway_db | gzip > /tmp/gateway_${DATE}.sql.gz\n  docker exec postgresql pg_dump -U mymed mymed_db | gzip > /tmp/mymed_${DATE}.sql.gz\n  aws s3 cp /tmp/gateway_${DATE}.sql.gz s3://oshili-backups/pg/gateway/\n  aws s3 cp /tmp/mymed_${DATE}.sql.gz s3://oshili-backups/pg/mymed/\n  rm -f /tmp/gateway_${DATE}.sql.gz /tmp/mymed_${DATE}.sql.gz\n\nCron: 0 4 * * * /opt/oshili/backup.sh\n\nS3 lifecycle (in Terraform s3.tf):\n  Expiration: 30 days on oshili-backups bucket\n\nRestore test:\n  gunzip < backup.sql.gz | docker exec -i postgresql psql -U mymed mymed_db',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-011',
      data: {
        title: 'Security: Add WAF rules for API protection',
        description: 'Add AWS WAF (Web Application Firewall) rules to the CloudFront distributions for API protection. Include rate limiting, SQL injection protection, and XSS protection using AWS managed rule groups.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-001'],
        acceptance_criteria: [
          'AWS WAF WebACL created and associated with API CloudFront distribution',
          'Rate limiting rule: max 100 requests per 5 minutes per IP',
          'AWS Managed Rules: AWSManagedRulesCommonRuleSet enabled',
          'AWS Managed Rules: AWSManagedRulesSQLiRuleSet enabled',
          'WAF logs sent to CloudWatch or S3',
          'Legitimate API requests pass through without blocking',
          'WAF resources defined in Terraform'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nLow priority - implement when approaching production traffic.\nAdd to terraform/waf.tf or extend terraform/cloudfront.tf.\nWAF pricing: ~$5/month for WebACL + rules + request volume.\nUse AWS Managed Rule Groups to avoid maintaining custom rules.',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'INFRA-012',
      data: {
        title: 'Monitoring: Set up AWS cost monitoring and budget alerts',
        description: 'Create AWS Budget with monthly threshold alerts to monitor infrastructure costs. Set up alerts at 80% and 100% of the $54/month target budget. Configure Cost Explorer tags for resource tracking.',
        feature_ref: featureRef,
        status: 'backlog',
        last_updated: lastUpdated,
        dependencies: ['INFRA-001'],
        acceptance_criteria: [
          'AWS Budget created with $54/month limit',
          'Alert at 80% threshold ($43) via email',
          'Alert at 100% threshold ($54) via email',
          'All Terraform-managed resources tagged with Project=oshili-doc and Environment=production',
          'Cost Explorer accessible with resource-level cost breakdown',
          'Budget defined in Terraform'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nLow priority but good practice.\nAdd to terraform/monitoring.tf or create terraform/budget.tf.\nUse aws_budgets_budget resource.\nTag all resources with: Project=oshili-doc, Environment=production.\nAWS Budgets is free for the first 2 budgets.',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    }
  ];

  const stmt = db.prepare('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');
  for (const t of tickets) {
    stmt.run([t.id, sortOrder++, JSON.stringify(t.data)]);
    console.log('Inserted:', t.id);
  }
  stmt.free();

  const outBuf = db.export();
  fs.writeFileSync(dbPath, Buffer.from(outBuf));
  console.log('Database saved. Total sort_order used:', sortOrder - 1);
}
main().catch(console.error);
