#!/bin/bash

# Build and push container image to various registries
# Usage: ./scripts/build-and-push.sh [registry-type] [registry-url] [tag]

set -e

REGISTRY_TYPE=${1:-docker-hub}
REGISTRY_URL=${2:-""}
TAG=${3:-latest}
IMAGE_NAME="load-tester"

# Build the image
echo "🔨 Building Docker image..."
docker build -t ${IMAGE_NAME}:${TAG} .

case $REGISTRY_TYPE in
  "docker-hub")
    if [ -z "$REGISTRY_URL" ]; then
      echo "❌ Docker Hub username required"
      echo "Usage: ./scripts/build-and-push.sh docker-hub <username> <tag>"
      exit 1
    fi
    
    echo "🏷️  Tagging image for Docker Hub..."
    docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY_URL}/${IMAGE_NAME}:${TAG}
    
    echo "📤 Pushing to Docker Hub..."
    docker push ${REGISTRY_URL}/${IMAGE_NAME}:${TAG}
    
    echo "✅ Image pushed to Docker Hub: ${REGISTRY_URL}/${IMAGE_NAME}:${TAG}"
    ;;
    
  "aws-ecr")
    if [ -z "$REGISTRY_URL" ]; then
      echo "❌ AWS ECR registry URL required"
      echo "Usage: ./scripts/build-and-push.sh aws-ecr <account-id>.dkr.ecr.<region>.amazonaws.com <tag>"
      exit 1
    fi
    
    # Extract region from ECR URL
    REGION=$(echo $REGISTRY_URL | cut -d'.' -f4)
    
    echo "🔐 Logging into AWS ECR..."
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY_URL
    
    echo "🏷️  Tagging image for AWS ECR..."
    docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY_URL}/${IMAGE_NAME}:${TAG}
    
    echo "📤 Pushing to AWS ECR..."
    docker push ${REGISTRY_URL}/${IMAGE_NAME}:${TAG}
    
    echo "✅ Image pushed to AWS ECR: ${REGISTRY_URL}/${IMAGE_NAME}:${TAG}"
    ;;
    
  "gcp-gcr")
    if [ -z "$REGISTRY_URL" ]; then
      echo "❌ GCP project ID required"
      echo "Usage: ./scripts/build-and-push.sh gcp-gcr <project-id> <tag>"
      exit 1
    fi
    
    echo "🔐 Configuring Docker for GCR..."
    gcloud auth configure-docker
    
    echo "🏷️  Tagging image for GCR..."
    docker tag ${IMAGE_NAME}:${TAG} gcr.io/${REGISTRY_URL}/${IMAGE_NAME}:${TAG}
    
    echo "📤 Pushing to GCR..."
    docker push gcr.io/${REGISTRY_URL}/${IMAGE_NAME}:${TAG}
    
    echo "✅ Image pushed to GCR: gcr.io/${REGISTRY_URL}/${IMAGE_NAME}:${TAG}"
    ;;
    
  "azure-acr")
    if [ -z "$REGISTRY_URL" ]; then
      echo "❌ Azure Container Registry name required"
      echo "Usage: ./scripts/build-and-push.sh azure-acr <registry-name> <tag>"
      exit 1
    fi
    
    echo "🔐 Logging into Azure ACR..."
    az acr login --name $REGISTRY_URL
    
    echo "🏷️  Tagging image for Azure ACR..."
    docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY_URL}.azurecr.io/${IMAGE_NAME}:${TAG}
    
    echo "📤 Pushing to Azure ACR..."
    docker push ${REGISTRY_URL}.azurecr.io/${IMAGE_NAME}:${TAG}
    
    echo "✅ Image pushed to Azure ACR: ${REGISTRY_URL}.azurecr.io/${IMAGE_NAME}:${TAG}"
    ;;
    
  *)
    echo "❌ Unsupported registry type: $REGISTRY_TYPE"
    echo "Supported types: docker-hub, aws-ecr, gcp-gcr, azure-acr"
    exit 1
    ;;
esac

echo "🎉 Build and push completed successfully!"