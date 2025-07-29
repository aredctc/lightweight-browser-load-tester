# Kubernetes Deployment Guide

This guide provides comprehensive instructions for deploying the Lightweight Browser Load Tester on Kubernetes, including local development environments and cloud providers like AWS EKS, Google GKE, and Azure AKS.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Container Image](#container-image)
- [Local Kubernetes Deployment](#local-kubernetes-deployment)
- [AWS EKS Deployment](#aws-eks-deployment)
- [Google GKE Deployment](#google-gke-deployment)
- [Azure AKS Deployment](#azure-aks-deployment)
- [Configuration Management](#configuration-management)
- [Monitoring and Observability](#monitoring-and-observability)
- [Scaling and Performance](#scaling-and-performance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **kubectl**: Kubernetes command-line tool
- **kustomize**: Configuration management tool (built into kubectl 1.14+)
- **docker**: Container runtime for building images
- **helm** (optional): Package manager for Kubernetes

### Kubernetes Cluster Requirements

- **Kubernetes version**: 1.20+
- **Node resources**: Minimum 4 CPU cores and 8GB RAM per node
- **Storage**: Persistent volume support for result storage
- **Network**: Internet access for streaming content and metrics export

## Container Image

### Building the Docker Image

```bash
# Build the container image
docker build -t load-tester:latest .

# Test the image locally
docker run --rm load-tester:latest node dist/index.js --version
```

### Multi-Architecture Build (Optional)

```bash
# Build for multiple architectures
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t load-tester:latest .
```

### Pushing to Container Registry

#### Docker Hub
```bash
docker tag load-tester:latest your-username/load-tester:latest
docker push your-username/load-tester:latest
```

#### AWS ECR
```bash
# Create ECR repository
aws ecr create-repository --repository-name load-tester --region us-west-2

# Get login token
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-west-2.amazonaws.com

# Tag and push
docker tag load-tester:latest <account-id>.dkr.ecr.us-west-2.amazonaws.com/load-tester:latest
docker push <account-id>.dkr.ecr.us-west-2.amazonaws.com/load-tester:latest
```

#### Google Container Registry
```bash
# Configure Docker for GCR
gcloud auth configure-docker

# Tag and push
docker tag load-tester:latest gcr.io/your-project-id/load-tester:latest
docker push gcr.io/your-project-id/load-tester:latest
```

#### Azure Container Registry
```bash
# Login to ACR
az acr login --name your-registry-name

# Tag and push
docker tag load-tester:latest your-registry-name.azurecr.io/load-tester:latest
docker push your-registry-name.azurecr.io/load-tester:latest
```

## Local Kubernetes Deployment

### Using Minikube

```bash
# Start Minikube with sufficient resources
minikube start --cpus=4 --memory=8192 --disk-size=20g

# Enable required addons
minikube addons enable ingress
minikube addons enable metrics-server

# Build image in Minikube's Docker environment
eval $(minikube docker-env)
docker build -t load-tester:latest .

# Deploy using Kustomize
kubectl apply -k k8s/overlays/local

# Check deployment status
kubectl get pods -n load-tester
kubectl logs -f deployment/load-tester -n load-tester
```

### Using Kind (Kubernetes in Docker)

```bash
# Create Kind cluster
kind create cluster --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
- role: worker
- role: worker
EOF

# Load image into Kind cluster
kind load docker-image load-tester:latest

# Deploy
kubectl apply -k k8s/overlays/local
```

### Using Docker Desktop Kubernetes

```bash
# Enable Kubernetes in Docker Desktop settings

# Deploy
kubectl apply -k k8s/overlays/local

# Port forward to access services
kubectl port-forward service/load-tester-service 8080:8080 -n load-tester
```

## AWS EKS Deployment

### Prerequisites

```bash
# Install AWS CLI and eksctl
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Configure AWS credentials
aws configure
```

### Create EKS Cluster

```bash
# Create EKS cluster with optimized node groups
eksctl create cluster \
  --name load-tester-cluster \
  --region us-west-2 \
  --version 1.28 \
  --nodegroup-name load-tester-nodes \
  --node-type c5.2xlarge \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 10 \
  --managed \
  --with-oidc \
  --ssh-access \
  --ssh-public-key your-key-name

# Install AWS Load Balancer Controller
eksctl utils associate-iam-oidc-provider --region us-west-2 --cluster load-tester-cluster --approve

curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.4.4/docs/install/iam_policy.json

aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

eksctl create iamserviceaccount \
  --cluster=load-tester-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name "AmazonEKSLoadBalancerControllerRole" \
  --attach-policy-arn=arn:aws:iam::<ACCOUNT-ID>:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=load-tester-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

### Deploy Application

```bash
# Update kustomization.yaml with your ECR repository
sed -i 's/<AWS_ACCOUNT_ID>/123456789012/g' k8s/overlays/aws-eks/kustomization.yaml
sed -i 's/<AWS_REGION>/us-west-2/g' k8s/overlays/aws-eks/kustomization.yaml

# Create IAM role for service account
eksctl create iamserviceaccount \
  --name load-tester-sa \
  --namespace load-tester \
  --cluster load-tester-cluster \
  --attach-policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonPrometheusRemoteWriteAccess \
  --approve \
  --override-existing-serviceaccounts

# Deploy application
kubectl apply -k k8s/overlays/aws-eks

# Check deployment
kubectl get pods -n load-tester
kubectl describe hpa load-tester-hpa -n load-tester
```

### Configure Secrets

```bash
# Create secrets for sensitive configuration
kubectl create secret generic load-tester-secrets \
  --from-literal=drm-license-url="https://your-drm-server.com/license" \
  --from-literal=prometheus-url="https://your-prometheus.com/api/v1/write" \
  --from-literal=prometheus-username="your-username" \
  --from-literal=prometheus-password="your-password" \
  --from-literal=otel-endpoint="https://your-otel-collector.com/v1/metrics" \
  -n load-tester
```

## Google GKE Deployment

### Create GKE Cluster

```bash
# Set project and region
export PROJECT_ID=your-project-id
export REGION=us-central1

# Create GKE cluster
gcloud container clusters create load-tester-cluster \
  --project=$PROJECT_ID \
  --zone=$REGION-a \
  --machine-type=c2-standard-8 \
  --num-nodes=2 \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=10 \
  --enable-autorepair \
  --enable-autoupgrade \
  --enable-ip-alias \
  --enable-network-policy

# Get credentials
gcloud container clusters get-credentials load-tester-cluster --zone=$REGION-a --project=$PROJECT_ID
```

### Deploy Application

```bash
# Create GKE-specific overlay (similar to AWS but with GKE-specific configurations)
cp -r k8s/overlays/aws-eks k8s/overlays/gke

# Update image repository
sed -i 's/amazonaws.com/gcr.io/g' k8s/overlays/gke/kustomization.yaml
sed -i 's/<AWS_ACCOUNT_ID>/your-project-id/g' k8s/overlays/gke/kustomization.yaml

# Deploy
kubectl apply -k k8s/overlays/gke
```

## Azure AKS Deployment

### Create AKS Cluster

```bash
# Create resource group
az group create --name load-tester-rg --location eastus

# Create AKS cluster
az aks create \
  --resource-group load-tester-rg \
  --name load-tester-cluster \
  --node-count 2 \
  --node-vm-size Standard_D4s_v3 \
  --enable-addons monitoring \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 10 \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group load-tester-rg --name load-tester-cluster
```

### Deploy Application

```bash
# Create AKS-specific overlay
cp -r k8s/overlays/aws-eks k8s/overlays/aks

# Update image repository
sed -i 's/amazonaws.com/azurecr.io/g' k8s/overlays/aks/kustomization.yaml
sed -i 's/<AWS_ACCOUNT_ID>/your-registry-name/g' k8s/overlays/aks/kustomization.yaml

# Deploy
kubectl apply -k k8s/overlays/aks
```

## Configuration Management

### ConfigMaps and Secrets

```bash
# Create configuration from file
kubectl create configmap load-tester-config-file \
  --from-file=load-test-config.yaml=test-configs/example-basic.json \
  -n load-tester

# Update configuration
kubectl patch configmap load-tester-config \
  --patch '{"data":{"concurrent-users":"20"}}' \
  -n load-tester

# View current configuration
kubectl get configmap load-tester-config -o yaml -n load-tester
```

### Environment-Specific Configurations

```bash
# Development environment
kubectl apply -k k8s/overlays/local

# Staging environment
kubectl apply -k k8s/overlays/staging

# Production environment
kubectl apply -k k8s/overlays/production
```

## Running Load Tests

### One-time Job

```bash
# Create a job for one-time load test
kubectl create job load-test-$(date +%Y%m%d-%H%M%S) \
  --from=cronjob/load-tester-cronjob \
  -n load-tester

# Monitor job progress
kubectl get jobs -n load-tester
kubectl logs job/load-test-20231201-143000 -n load-tester -f
```

### Scheduled Tests

```bash
# View scheduled jobs
kubectl get cronjobs -n load-tester

# Manually trigger scheduled job
kubectl create job manual-test --from=cronjob/load-tester-cronjob -n load-tester

# Update schedule
kubectl patch cronjob load-tester-cronjob \
  --patch '{"spec":{"schedule":"0 */6 * * *"}}' \
  -n load-tester
```

### Parallel Load Tests

```bash
# Run multiple parallel tests
for i in {1..5}; do
  kubectl create job parallel-test-$i \
    --from=cronjob/load-tester-cronjob \
    -n load-tester
done

# Monitor all parallel jobs
kubectl get jobs -l app=load-tester -n load-tester
```

## Monitoring and Observability

### Prometheus Integration

```bash
# Install Prometheus using Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false

# Create ServiceMonitor for load tester
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: load-tester-metrics
  namespace: load-tester
  labels:
    app: load-tester
spec:
  selector:
    matchLabels:
      service: metrics
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
EOF
```

### Grafana Dashboards

```bash
# Access Grafana
kubectl port-forward service/prometheus-grafana 3000:80 -n monitoring

# Import load tester dashboard (create custom dashboard with metrics)
# - load_test_requests_total
# - load_test_request_duration_seconds
# - load_test_active_sessions
# - load_test_drm_license_duration_seconds
```

### Logging

```bash
# View application logs
kubectl logs -f deployment/load-tester -n load-tester

# View job logs
kubectl logs job/load-test-job -n load-tester

# Stream logs from all pods
kubectl logs -f -l app=load-tester -n load-tester --all-containers=true
```

## Scaling and Performance

### Horizontal Pod Autoscaler

```bash
# View HPA status
kubectl get hpa -n load-tester

# Update HPA configuration
kubectl patch hpa load-tester-hpa \
  --patch '{"spec":{"maxReplicas":20}}' \
  -n load-tester

# Manual scaling
kubectl scale deployment load-tester --replicas=5 -n load-tester
```

### Vertical Pod Autoscaler (Optional)

```bash
# Install VPA
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vpa-release.yaml

# Create VPA for load tester
kubectl apply -f - <<EOF
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: load-tester-vpa
  namespace: load-tester
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: load-tester
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: load-tester
      maxAllowed:
        cpu: 8
        memory: 16Gi
      minAllowed:
        cpu: 500m
        memory: 1Gi
EOF
```

### Node Affinity and Taints

```bash
# Label nodes for load testing
kubectl label nodes node-1 node-2 workload-type=load-testing

# Taint nodes for dedicated load testing
kubectl taint nodes node-1 node-2 load-testing=true:NoSchedule

# Update deployment to use tainted nodes
kubectl patch deployment load-tester \
  --patch '{"spec":{"template":{"spec":{"tolerations":[{"key":"load-testing","operator":"Equal","value":"true","effect":"NoSchedule"}]}}}}' \
  -n load-tester
```

## Troubleshooting

### Common Issues

#### Pod Startup Issues

```bash
# Check pod status
kubectl get pods -n load-tester
kubectl describe pod <pod-name> -n load-tester

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp -n load-tester

# Check resource constraints
kubectl top pods -n load-tester
kubectl top nodes
```

#### Browser Launch Failures

```bash
# Check if Chromium is available in container
kubectl exec -it deployment/load-tester -n load-tester -- which chromium-browser

# Check security context
kubectl get pod <pod-name> -o yaml -n load-tester | grep -A 10 securityContext

# Check /dev/shm mount
kubectl exec -it deployment/load-tester -n load-tester -- df -h /dev/shm
```

#### Network Issues

```bash
# Test network connectivity
kubectl exec -it deployment/load-tester -n load-tester -- nslookup google.com

# Check DNS resolution
kubectl exec -it deployment/load-tester -n load-tester -- cat /etc/resolv.conf

# Test streaming URL access
kubectl exec -it deployment/load-tester -n load-tester -- curl -I https://example.com/stream
```

#### Resource Constraints

```bash
# Check resource usage
kubectl top pods -n load-tester
kubectl describe nodes

# Check resource requests and limits
kubectl describe deployment load-tester -n load-tester

# Check HPA metrics
kubectl describe hpa load-tester-hpa -n load-tester
```

### Debugging Commands

```bash
# Get detailed pod information
kubectl get pod <pod-name> -o yaml -n load-tester

# Execute commands in running container
kubectl exec -it deployment/load-tester -n load-tester -- /bin/sh

# Port forward for debugging
kubectl port-forward pod/<pod-name> 8080:8080 -n load-tester

# Copy files from pod
kubectl cp load-tester/<pod-name>:/results/test-results.json ./test-results.json

# View resource usage over time
kubectl top pods -n load-tester --containers
```

### Performance Tuning

```bash
# Optimize resource requests and limits
kubectl patch deployment load-tester \
  --patch '{"spec":{"template":{"spec":{"containers":[{"name":"load-tester","resources":{"requests":{"memory":"4Gi","cpu":"2"},"limits":{"memory":"16Gi","cpu":"8"}}}]}}}}' \
  -n load-tester

# Adjust JVM heap size
kubectl patch deployment load-tester \
  --patch '{"spec":{"template":{"spec":{"containers":[{"name":"load-tester","env":[{"name":"NODE_OPTIONS","value":"--max-old-space-size=8192"}]}]}}}}' \
  -n load-tester

# Enable CPU and memory profiling
kubectl patch deployment load-tester \
  --patch '{"spec":{"template":{"spec":{"containers":[{"name":"load-tester","env":[{"name":"NODE_ENV","value":"development"}]}]}}}}' \
  -n load-tester
```

## Best Practices

### Security

1. **Use non-root containers**: Always run containers as non-root user
2. **Limit privileges**: Use security contexts to drop unnecessary capabilities
3. **Network policies**: Implement network policies to restrict traffic
4. **Secret management**: Use Kubernetes secrets for sensitive data
5. **Image scanning**: Scan container images for vulnerabilities

### Resource Management

1. **Set resource requests and limits**: Prevent resource starvation
2. **Use appropriate node types**: Choose compute-optimized instances
3. **Monitor resource usage**: Use metrics to optimize resource allocation
4. **Implement autoscaling**: Use HPA and cluster autoscaler

### Operational Excellence

1. **Use namespaces**: Isolate environments using namespaces
2. **Label resources**: Use consistent labeling for resource management
3. **Implement monitoring**: Set up comprehensive monitoring and alerting
4. **Backup configurations**: Version control all Kubernetes manifests
5. **Test deployments**: Use staging environments for testing

This comprehensive guide should help you deploy and manage the Lightweight Browser Load Tester on various Kubernetes platforms effectively.