# Magnum Opus Cloudflare Deployment Guide

## Overview

This guide will help you deploy Magnum Opus to Cloudflare Workers/Pages for your storefront.

## Prerequisites

- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)
- Access to your GitHub repository

## Deployment Options

### Option 1: Cloudflare Workers (Using \_worker.js)

1. Install Wrangler CLI:

   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:

   ```bash
   wrangler login
   ```

3. Create a wrangler.toml file:

   ```toml
   name = "magnum-opus-storefront"
   main = "_worker.js"
   compatibility_date = "2024-01-01"

   [env.production]
   name = "magnum-opus-storefront-prod"
   ```

4. Deploy to Cloudflare:
   ```bash
   wrangler deploy
   ```

### Option 2: Cloudflare Pages (GitHub Integration)

1. Go to Cloudflare Dashboard → Pages
2. Connect GitHub repository: `Scofowiz/NovaWrite.theboldcocde.shop`
3. Configure build settings:
   - Framework preset: None
   - Build command: `echo 'Storefront Only'`
   - Build output directory: `/`

4. Add custom domain or use provided pages.dev subdomain

## Repository Structure

Your repository now contains:

```
NovaWrite.theboldcocde.shop/
├── storefront.html          # Standalone storefront (for reference)
├── _worker.js            # Cloudflare Worker script
├── COMPREHENSIVE_DOCUMENTATION.md
├── README.md             # Updated with project overview
├── cloudflare-deployment.md # This file
├── src/                  # Source code
├── server/               # Backend server
├── docs/                 # Documentation
└── .github/              # GitHub workflows
```

## Post-Deployment

1. Visit your Cloudflare Pages URL
2. Configure custom domain if desired
3. Test the storefront display
4. Monitor analytics in Cloudflare dashboard

## Next Steps

- Deploy the main application separately (as you mentioned different repos)
- Configure environment variables for production
- Set up monitoring and analytics
- Consider CDN optimization for static assets
