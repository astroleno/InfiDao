#!/usr/bin/env node

/**
 * Health Check Script
 * Verifies system health and dependencies for the InfiDao platform
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const execOptions = {
  timeout: 10000,
  maxBuffer: 1024 * 1024,
};

class HealthChecker {
  constructor() {
    this.checks = [];
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      total: 0
    };
  }

  async runCheck(name, checkFn, critical = true) {
    console.log(`🔍 Checking: ${name}`);

    try {
      const result = await checkFn();
      if (result.passed) {
        console.log(`  ✅ ${result.message || 'OK'}`);
        this.results.passed++;
      } else {
        console.log(`  ❌ ${result.message || 'Failed'}`);
        if (critical) {
          this.results.failed++;
        } else {
          console.log(`  ⚠️  Warning: ${result.message || 'Warning'}`);
          this.results.warnings++;
        }
      }
      return result;
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      if (critical) {
        this.results.failed++;
      } else {
        this.results.warnings++;
      }
      return { passed: false, message: error.message };
    } finally {
      this.results.total++;
    }
  }

  async checkNodeVersion() {
    const { stdout } = await execAsync('node --version', execOptions);
    const version = stdout.trim().replace('v', '');
    const majorVersion = parseInt(version.split('.')[0]);

    return {
      passed: majorVersion >= 18,
      message: `Node.js v${version} ${majorVersion >= 18 ? '✓' : '(requires >= 18.0.0)'}`,
      details: { version, majorVersion }
    };
  }

  async checkNpmVersion() {
    try {
      const { stdout } = await execAsync('npm --version', execOptions);
      const version = stdout.trim();

      return {
        passed: true,
        message: `npm v${version}`,
        details: { version }
      };
    } catch (error) {
      return {
        passed: false,
        message: 'npm not found'
      };
    }
  }

  async checkDependencies() {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      await fs.access(packagePath);

      const nodeModulesPath = path.join(process.cwd(), 'node_modules');
      try {
        await fs.access(nodeModulesPath);
        return {
          passed: true,
          message: 'Dependencies installed'
        };
      } catch {
        return {
          passed: false,
          message: 'Dependencies not installed (run npm install)',
          action: 'npm install'
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: 'package.json not found'
      };
    }
  }

  async checkEnvironmentFile() {
    const envPath = path.join(process.cwd(), '.env.local');
    const examplePath = path.join(process.cwd(), '.env.example');

    let hasExample = false;
    let hasEnv = false;

    try {
      await fs.access(examplePath);
      hasExample = true;
    } catch {}

    try {
      await fs.access(envPath);
      hasEnv = true;
    } catch {}

    if (hasExample && !hasEnv) {
      return {
        passed: false,
        message: '.env.local not found (copy from .env.example)',
        action: 'cp .env.example .env.local'
      };
    } else if (hasEnv) {
      // Check if required env vars are set
      const envContent = await fs.readFile(envPath, 'utf-8');
      const hasRequiredKeys = envContent.includes('LLM_PROVIDER') &&
                             envContent.includes('DATABASE_PATH');

      return {
        passed: hasRequiredKeys,
        message: hasRequiredKeys ? 'Environment configured' : 'Environment incomplete',
        details: { hasExample, hasEnv }
      };
    } else {
      return {
        passed: false,
        critical: false,
        message: 'No environment configuration found'
      };
    }
  }

  async checkDatabasePath() {
    // Load environment variables
    try {
      require('dotenv').config({ path: '.env.local' });
    } catch {}

    const dbPath = process.env.DATABASE_PATH || process.env.LANCEDB_PATH || './data/lancedb';
    const dataDir = path.dirname(dbPath);

    try {
      await fs.access(dataDir);
      return {
        passed: true,
        message: `Database directory accessible: ${dataDir}`,
        details: { dbPath, dataDir }
      };
    } catch {
      try {
        await fs.mkdir(dataDir, { recursive: true });
        return {
          passed: true,
          message: `Database directory created: ${dataDir}`,
          details: { dbPath, dataDir }
        };
      } catch (error) {
        return {
          passed: false,
          message: `Cannot create database directory: ${dataDir}`,
          details: { error: error.message }
        };
      }
    }
  }

  async checkModelDirectory() {
    const modelPath = process.env.BGE_MODEL_PATH || './models/bge-m3';

    try {
      await fs.access(modelPath);
      const files = await fs.readdir(modelPath);
      const hasModel = files.some(file => file.includes('model') || file.includes('bin'));

      return {
        passed: hasModel,
        message: hasModel ? 'Model files found' : 'Model directory exists but no model files',
        details: { modelPath, fileCount: files.length },
        critical: false
      };
    } catch {
      try {
        await fs.mkdir(modelPath, { recursive: true });
        return {
          passed: false,
          message: `Model directory created: ${modelPath} (run npm run download-model)`,
          details: { modelPath },
          action: 'npm run download-model'
        };
      } catch (error) {
        return {
          passed: false,
          message: `Cannot create model directory: ${modelPath}`,
          details: { error: error.message }
        };
      }
    }
  }

  async checkDiskSpace() {
    try {
      const { stdout } = await execAsync('df -h .', execOptions);
      const lines = stdout.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const parts = dataLine.split(/\s+/);
      const available = parts[3]; // Available space
      const usedPercent = parts[4]; // Used percentage

      const usedNum = parseInt(usedPercent);
      const hasSpace = usedNum < 90; // Less than 90% used

      return {
        passed: hasSpace,
        message: `Disk space: ${usedPercent} used, ${available} available`,
        details: { available, usedPercent, usedNum },
        critical: usedNum > 95
      };
    } catch (error) {
      return {
        passed: true,
        critical: false,
        message: 'Could not check disk space',
        details: { error: error.message }
      };
    }
  }

  async checkPorts() {
    const port = process.env.PORT || 3000;

    try {
      // Try to check if port is in use
      const { stdout } = await execAsync(`lsof -i :${port}`, execOptions);
      const lines = stdout.trim().split('\n');
      const hasProcess = lines.length > 1;

      return {
        passed: !hasProcess,
        message: hasProcess ? `Port ${port} is in use` : `Port ${port} is available`,
        details: { port, inUse: hasProcess },
        critical: false
      };
    } catch (error) {
      // Command failed means port is likely available
      return {
        passed: true,
        message: `Port ${port} is available`,
        details: { port }
      };
    }
  }

  async runAllChecks() {
    console.log('🏥 InfiDao Health Check');
    console.log('='.repeat(30));

    await this.runCheck('Node.js Version', () => this.checkNodeVersion());
    await this.runCheck('npm Version', () => this.checkNpmVersion());
    await this.runCheck('Dependencies', () => this.checkDependencies());
    await this.runCheck('Environment Configuration', () => this.checkEnvironmentFile());
    await this.runCheck('Database Directory', () => this.checkDatabasePath());
    await this.runCheck('Model Directory', () => this.checkModelDirectory(), false);
    await this.runCheck('Disk Space', () => this.checkDiskSpace());
    await this.runCheck('Port Availability', () => this.checkPorts(), false);

    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(30));
    console.log('📊 Health Check Summary');
    console.log('='.repeat(30));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📋 Total: ${this.results.total}`);

    const successRate = (this.results.passed / this.results.total) * 100;
    console.log(`🎯 Success Rate: ${successRate.toFixed(1)}%`);

    if (this.results.failed === 0) {
      console.log('\n🎉 All critical checks passed!');
      console.log('\n💡 Ready to start:');
      console.log('   npm run dev    # Start development server');

      if (this.results.warnings > 0) {
        console.log('\n⚠️  Some warnings detected. Review above for recommended actions.');
      }
    } else {
      console.log('\n❌ Some critical checks failed.');
      console.log('   Please resolve the issues above before starting the application.');
    }
  }
}

async function main() {
  const checker = new HealthChecker();
  await checker.runAllChecks();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { HealthChecker };