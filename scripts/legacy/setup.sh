#!/bin/bash

# InfiDao Backend Setup Script
# This script helps set up the backend services for the InfiDao project

set -e

echo "🚀 Setting up InfiDao Backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if Node.js is installed
check_nodejs() {
    print_info "Checking Node.js..."
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js is installed: $NODE_VERSION"
    else
        print_error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
}

# Check if npm is installed
check_npm() {
    print_info "Checking npm..."
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm is installed: $NPM_VERSION"
    else
        print_error "npm is not installed."
        exit 1
    fi
}

# Install dependencies
install_dependencies() {
    print_info "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Create necessary directories
create_directories() {
    print_info "Creating necessary directories..."

    directories=(
        "data"
        "data/lancedb"
        "models"
        "models/bge-m3"
        "logs"
    )

    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_success "Created directory: $dir"
        fi
    done
}

# Setup environment file
setup_environment() {
    print_info "Setting up environment configuration..."

    if [ ! -f ".env.local" ]; then
        cp .env.example .env.local
        print_warning "Created .env.local from .env.example"
        print_warning "Please edit .env.local with your configuration"
    else
        print_info ".env.local already exists"
    fi
}

# Check Redis (optional)
check_redis() {
    print_info "Checking Redis connection..."

    if command -v redis-cli &> /dev/null; then
        if redis-cli ping &> /dev/null; then
            print_success "Redis is running"
        else
            print_warning "Redis is not running. Cache will use in-memory only."
        fi
    else
        print_warning "Redis is not installed. Cache will use in-memory only."
        print_info "Install Redis for better performance: https://redis.io/download"
    fi
}

# Download BGE-M3 model
download_model() {
    print_info "Checking BGE-M3 model..."

    if [ ! -d "models/bge-m3" ] || [ -z "$(ls -A models/bge-m3)" ]; then
        print_info "Downloading BGE-M3 model..."
        npm run download-model
        print_success "BGE-M3 model downloaded"
    else
        print_success "BGE-M3 model already exists"
    fi
}

# Initialize database
init_database() {
    print_info "Initializing database..."
    npm run init-db
    print_success "Database initialized"
}

# Import sample data (optional)
import_data() {
    read -p "Do you want to import sample data? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Importing sample data..."
        npm run import-data
        print_success "Sample data imported"
    fi
}

# Run type check
type_check() {
    print_info "Running type check..."
    npm run type-check
    print_success "Type check passed"
}

# Build project
build_project() {
    print_info "Building project..."
    npm run build
    print_success "Project built successfully"
}

# Main setup flow
main() {
    echo "=========================================="
    echo "       InfiDao Backend Setup v1.0        "
    echo "=========================================="
    echo

    check_nodejs
    check_npm

    print_info "Project directory: $(pwd)"
    echo

    install_dependencies
    create_directories
    setup_environment
    check_redis

    echo
    read -p "Do you want to download the BGE-M3 model? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        download_model
    fi

    echo
    read -p "Do you want to initialize the database now? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        init_database
        import_data
    fi

    echo
    read -p "Do you want to run type check and build? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        type_check
        build_project
    fi

    echo
    print_success "Setup completed successfully!"
    echo
    print_info "Next steps:"
    echo "1. Edit .env.local with your API keys"
    echo "2. Run 'npm run dev' to start the development server"
    echo "3. Visit http://localhost:3000/api/health to check the service status"
    echo
    print_info "Useful commands:"
    echo "- npm run dev        - Start development server"
    echo "- npm run build      - Build for production"
    echo "- npm run start      - Start production server"
    echo "- npm run lint       - Run linter"
    echo "- npm run type-check - Check types"
    echo
}

# Run main function
main "$@"