echo "Updating Pulumi Stack"

# Download dependencies and build
npm install

# Update the stack
pulumi stack select dev
pulumi up --yes
