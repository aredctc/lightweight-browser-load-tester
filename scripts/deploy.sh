#!/bin/bash

# Deploy load tester to Kubernetes
# Usage: ./scripts/deploy.sh [environment] [action]

set -e

ENVIRONMENT=${1:-local}
ACTION=${2:-apply}

# Validate environment
case $ENVIRONMENT in
  "local"|"aws-eks"|"gke"|"aks")
    echo "🚀 Deploying to $ENVIRONMENT environment..."
    ;;
  *)
    echo "❌ Unsupported environment: $ENVIRONMENT"
    echo "Supported environments: local, aws-eks, gke, aks"
    exit 1
    ;;
esac

# Validate action
case $ACTION in
  "apply"|"delete"|"diff")
    echo "📋 Action: $ACTION"
    ;;
  *)
    echo "❌ Unsupported action: $ACTION"
    echo "Supported actions: apply, delete, diff"
    exit 1
    ;;
esac

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if kustomize is available (should be built into kubectl 1.14+)
if ! kubectl kustomize --help &> /dev/null; then
    echo "❌ kustomize is not available in kubectl"
    exit 1
fi

# Set overlay path
OVERLAY_PATH="k8s/overlays/$ENVIRONMENT"

if [ ! -d "$OVERLAY_PATH" ]; then
    echo "❌ Overlay directory not found: $OVERLAY_PATH"
    exit 1
fi

echo "📁 Using overlay: $OVERLAY_PATH"

# Perform the action
case $ACTION in
  "apply")
    echo "🔄 Applying Kubernetes manifests..."
    kubectl apply -k $OVERLAY_PATH
    
    echo "⏳ Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/load-tester -n load-tester
    
    echo "📊 Checking deployment status..."
    kubectl get pods -n load-tester
    kubectl get services -n load-tester
    
    if kubectl get hpa load-tester-hpa -n load-tester &> /dev/null; then
        echo "📈 HPA status:"
        kubectl get hpa load-tester-hpa -n load-tester
    fi
    
    echo "✅ Deployment completed successfully!"
    ;;
    
  "delete")
    echo "🗑️  Deleting Kubernetes resources..."
    kubectl delete -k $OVERLAY_PATH --ignore-not-found=true
    
    echo "⏳ Waiting for resources to be deleted..."
    kubectl wait --for=delete namespace/load-tester --timeout=120s || true
    
    echo "✅ Resources deleted successfully!"
    ;;
    
  "diff")
    echo "🔍 Showing diff of what would be applied..."
    kubectl diff -k $OVERLAY_PATH || true
    ;;
esac

# Environment-specific post-deployment actions
case $ENVIRONMENT in
  "local")
    echo ""
    echo "🏠 Local deployment completed!"
    echo "💡 To access the service locally:"
    echo "   kubectl port-forward service/load-tester-service 8080:8080 -n load-tester"
    echo "💡 To view logs:"
    echo "   kubectl logs -f deployment/load-tester -n load-tester"
    ;;
    
  "aws-eks")
    echo ""
    echo "☁️  AWS EKS deployment completed!"
    echo "💡 To check the load balancer:"
    echo "   kubectl get service load-tester-service -n load-tester"
    echo "💡 To view HPA status:"
    echo "   kubectl get hpa load-tester-hpa -n load-tester"
    ;;
    
  "gke")
    echo ""
    echo "☁️  Google GKE deployment completed!"
    echo "💡 To check the load balancer:"
    echo "   kubectl get service load-tester-service -n load-tester"
    echo "💡 To view cluster info:"
    echo "   gcloud container clusters describe load-tester-cluster"
    ;;
    
  "aks")
    echo ""
    echo "☁️  Azure AKS deployment completed!"
    echo "💡 To check the load balancer:"
    echo "   kubectl get service load-tester-service -n load-tester"
    echo "💡 To view cluster info:"
    echo "   az aks show --resource-group load-tester-rg --name load-tester-cluster"
    ;;
esac