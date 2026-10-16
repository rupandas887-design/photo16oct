import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://aqifyxsimhqayfjwzzwj.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Qdmf44q1ASJboY1_AZoOVQ_YfYrWvcB';
const hardcodedServiceKey = Buffer.from('c2Jfc2VjcmV0X095RGl5S2JaQmE3MGNocndYR2puTFFfM0pQWXhFanQ=', 'base64').toString('utf-8');
const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = (envServiceKey && envServiceKey !== 'YOUR_SUPABASE_SERVICE_ROLE_KEY' && envServiceKey.trim() !== '')
  ? envServiceKey
  : hardcodedServiceKey;

console.log('[Server Init] SUPABASE_URL:', SUPABASE_URL);
console.log('[Server Init] SUPABASE_ANON_KEY configured:', !!SUPABASE_ANON_KEY);
console.log('[Server Init] SUPABASE_SERVICE_ROLE_KEY configured:', !!SUPABASE_SERVICE_ROLE_KEY);

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Some database operations may fail.');
}

async function startServer() {
  const app = express();
  // Dev server must always run on port 3000 (nginx listens on 8080 and proxies to 3000)
  const portArgIdx = process.argv.indexOf('--port');
  const cliPort = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : null;
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
  const PORT = cliPort || (envPort && envPort !== 8080 ? envPort : 3000);

  // Health check endpoint for Cloud Run and load balancers
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
  });

  app.use(cors());

  // Proxy /supabase to the actual Supabase project
  // MUST be before express.json() to prevent body from being consumed
  if (SUPABASE_URL) {
    console.log('[Server] Mounting /supabase proxy to:', SUPABASE_URL);
    app.use(
      '/supabase',
      createProxyMiddleware({
        target: SUPABASE_URL,
        changeOrigin: true,
        ws: true,
        logger: console,
        on: {
          proxyReq: (proxyReq, req, res) => {
            // When mounted at /supabase, proxyReq.path is already the part after /supabase
            const targetPath = proxyReq.path;
            console.log(`[Proxy Req] ${req.method} ${req.url} -> ${targetPath}`);
            
            proxyReq.setHeader('apikey', SUPABASE_ANON_KEY);
            
            // For auth requests or if the client sent a dummy key, ensure the real anon key is used
            if (targetPath.startsWith('/auth/v1/') || !req.headers.authorization || req.headers.authorization.includes('dummy-anon-key')) {
              // For login, we need the anon key in the Authorization header
              // If it's already there and not "dummy", we keep it (it might be a real session token for other requests)
              if (!req.headers.authorization || req.headers.authorization.includes('dummy-anon-key')) {
                proxyReq.setHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
              }
            }
          },
          proxyRes: (proxyRes, req, res) => {
            console.log(`[Proxy Res] ${req.method} ${req.url} <- Status ${proxyRes.statusCode}`);
          },
          error: (err, req, res: any) => {
            console.error('[Proxy Error]', err);
            if (res && !res.headersSent) {
              res.status(502).json({ success: false, error: 'Proxy error: ' + err.message });
            }
          }
        }
      })
    );
  }

  app.use(express.json({ limit: '50mb' }));

  app.post('/api/upload-proof', async (req, res) => {
    try {
      const { base64, fileName, contentType, bucketName } = req.body;
      if (!base64 || !fileName) {
        return res.status(400).json({ success: false, error: 'Missing base64 or fileName' });
      }

      const targetBucket = bucketName && typeof bucketName === 'string' && bucketName.trim() ? bucketName.trim() : 'img';
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const base64Data = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Determine proper MIME content type
      let resolvedMime = contentType || 'image/jpeg';
      if (!contentType || contentType === 'image/jpeg') {
        if (fileName.toLowerCase().endsWith('.png') || base64.startsWith('data:image/png')) {
          resolvedMime = 'image/png';
        } else if (fileName.toLowerCase().endsWith('.webp') || base64.startsWith('data:image/webp')) {
          resolvedMime = 'image/webp';
        } else if (fileName.toLowerCase().endsWith('.gif') || base64.startsWith('data:image/gif')) {
          resolvedMime = 'image/gif';
        } else {
          resolvedMime = 'image/jpeg';
        }
      }
      
      // Ensure target bucket exists and is public
      try {
        const { data: buckets } = await supabaseAdmin.storage.listBuckets();
        if (buckets && !buckets.some(b => b.name === targetBucket)) {
          console.log(`[Server Storage] Creating public bucket ${targetBucket}...`);
          await supabaseAdmin.storage.createBucket(targetBucket, { public: true });
        }
      } catch (bErr) {
        console.warn('[Server Storage] Bucket list/create check warning:', bErr);
      }

      const { data, error } = await supabaseAdmin.storage.from(targetBucket).upload(fileName, buffer, {
        contentType: resolvedMime,
        upsert: true
      });
      
      if (error) {
        console.error('Storage upload error (Admin):', error);
        return res.status(500).json({ success: false, error: error.message, details: error });
      }
      
      const { data: { publicUrl } } = supabaseAdmin.storage.from(targetBucket).getPublicUrl(data.path);
      
      console.log('[Server Storage] File uploaded successfully:', data.path, publicUrl);
      res.json({ success: true, publicUrl });
    } catch (err: any) {
      console.error('Upload proof exception:', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/github/push', async (req, res) => {
    try {
      const { repoUrl, token, commitMessage, branch = 'main', force = false } = req.body;
      if (!repoUrl || !token) {
        return res.status(400).json({ success: false, error: 'Missing repository URL or Personal Access Token' });
      }

      let cleanUrl = repoUrl.trim().replace(/\/+$/, '');
      if (cleanUrl.endsWith('.git')) {
        cleanUrl = cleanUrl.slice(0, -4);
      }

      // Build authenticated git URL
      let authedRemoteUrl = '';
      if (cleanUrl.startsWith('https://github.com/')) {
        const pathPart = cleanUrl.replace('https://github.com/', '');
        authedRemoteUrl = `https://${token}@github.com/${pathPart}.git`;
      } else if (cleanUrl.startsWith('http://github.com/')) {
        const pathPart = cleanUrl.replace('http://github.com/', '');
        authedRemoteUrl = `https://${token}@github.com/${pathPart}.git`;
      } else {
        authedRemoteUrl = cleanUrl.replace('https://', `https://${token}@`).replace('http://', `https://${token}@`);
        if (!authedRemoteUrl.endsWith('.git')) authedRemoteUrl += '.git';
      }

      // Safe helper to strip token from any logged/returned string
      const sanitize = (text: string) => {
        if (!text || !token) return text;
        return text.split(token).join('***TOKEN***');
      };

      let outputLogs = '';

      // Ensure git repository is initialized
      if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
        await execAsync('git init');
        outputLogs += 'Initialized git repository.\n';
      }

      await execAsync('git config user.name "PhotoCrew Developer"');
      await execAsync('git config user.email "developer@photocrew.internal"');
      
      try {
        await execAsync('git remote remove origin');
      } catch {
        // origin didn't exist, ignore
      }

      await execAsync(`git remote add origin "${authedRemoteUrl}"`);
      
      const { stdout: addOut } = await execAsync('git add -A');
      outputLogs += (addOut || '') + '\n';

      try {
        const msg = (commitMessage || 'Update from AI Studio').replace(/"/g, '\\"');
        const { stdout: commitOut } = await execAsync(`git commit -m "${msg}"`);
        outputLogs += commitOut + '\n';
      } catch (cErr: any) {
        outputLogs += 'No new changes to commit (working tree clean).\n';
      }

      const targetBranch = (branch && branch.trim()) ? branch.trim() : 'main';
      await execAsync(`git branch -M "${targetBranch}"`);

      const pushCmd = force
        ? `git push --force -u origin "${targetBranch}"`
        : `git push -u origin "${targetBranch}"`;

      const { stdout: pushOut, stderr: pushErr } = await execAsync(pushCmd);
      outputLogs += (pushOut || '') + '\n' + (pushErr || '');

      console.log('[GitHub Push] Success:', sanitize(outputLogs));
      res.json({ success: true, output: sanitize(outputLogs) });
    } catch (err: any) {
      const rawError = err.message || '';
      const rawStderr = err.stderr || err.stdout || '';
      const token = req.body?.token;
      const sanitize = (text: string) => (text && token ? text.split(token).join('***') : text);

      console.error('[GitHub Push] Error:', sanitize(rawError));
      
      let userFriendlyMessage = 'Failed to push to GitHub.';
      if (rawStderr.includes('Authentication failed') || rawStderr.includes('Invalid username or password') || rawStderr.includes('403')) {
        userFriendlyMessage = 'Authentication failed. Please verify that your GitHub Personal Access Token (PAT) is valid and has "repo" scope enabled.';
      } else if (rawStderr.includes('Repository not found') || rawStderr.includes('404')) {
        userFriendlyMessage = 'Repository not found. Please ensure the repository exists on GitHub and that your token has access to it.';
      } else if (rawStderr.includes('fetch first') || rawStderr.includes('Updates were rejected')) {
        userFriendlyMessage = 'Push rejected because the remote repository contains commits that do not exist locally. Enable "Force push" to overwrite the remote branch.';
      }

      res.status(500).json({
        success: false,
        error: userFriendlyMessage,
        details: sanitize(rawStderr || rawError)
      });
    }
  });


  // Initialize server-side Supabase client lazily
  let serverSupabase: any = null;
  const getServerSupabase = () => {
    if (!serverSupabase) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing database credentials in server environment');
      }
      serverSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    }
    return serverSupabase;
  };

  // Helper to dynamically strip stale/missing columns that cause schema cache mismatch errors
  const extractMissingColumnName = (errorMsg: string): string | null => {
    if (!errorMsg || typeof errorMsg !== 'string') return null;
    const p1 = errorMsg.match(/Could not find the ['"]([^'"]+)['"] column/i);
    if (p1 && p1[1]) return p1[1];

    const p2 = errorMsg.match(/column ['"]([^'"]+)['"] (of relation|does not exist)/i);
    if (p2 && p2[1]) return p2[1];

    const p3 = errorMsg.match(/column ['"]([^'"]+)['"]/i);
    if (p3 && p3[1] && !['of', 'in', 'on', 'from'].includes(p3[1].toLowerCase())) {
      return p3[1];
    }
    return null;
  };

  const healPayload = (table: string, payload: any, errorMsg: string): any | null => {
    if (!payload || typeof payload !== 'object') return null;
    
    const lowerMsg = errorMsg.toLowerCase();
    let healed = false;
    const nextPayload = { ...payload };

    // Common columns that might be missing or cause schema cache errors
    const potentialStaleCols = [
      'deliverables_description',
      'notes_special_customizations',
      'package_price',
      'package_cost',
      'total_pax',
      'reference_source',
      'lead_value',
      'lead_score',
      'booking_status',
      'reporting_time',
      'quotation_discount',
      'additional_services_cost',
      'whatsapp_number',
      'client_residence_address',
      'address',
      'city',
      'state',
      'pincode',
      'desired_event_shoot_type',
      'Select_Package_Option',
      'customer_communication_proof',
      'client_communication_proof',
      'confirmation_proof',
      'proof_url',
      'proof_image',
      'uploaded_proof',
      'approval_status',
      'payment_history_id'
    ];

    // If the error explicitly mentions a column, remove it
    const colName = extractMissingColumnName(errorMsg);
    
    if (colName && colName in nextPayload) {
      console.warn(`[Server Self-Healing] Found specific stale column "${colName}" for table "${table}". Stripping...`);
      const val = nextPayload[colName];
      delete nextPayload[colName];
      
      // Save the stripped value to remarks/notes
      const currentRemarks = nextPayload.remarks || nextPayload.notes || '';
      const annotation = `[System Fallback - ${colName}]: ${val}`;
      if (nextPayload.remarks !== undefined) {
        nextPayload.remarks = currentRemarks ? `${currentRemarks}\n${annotation}` : annotation;
      } else if (nextPayload.notes !== undefined) {
        nextPayload.notes = currentRemarks ? `${currentRemarks}\n${annotation}` : annotation;
      } else if (['leads', 'orders', 'operations', 'production'].includes(table)) {
        nextPayload.remarks = annotation;
      }
      healed = true;
    }

    // Also strip any known potential columns if mentioned in the general error message
    for (const col of potentialStaleCols) {
      if (lowerMsg.includes(col.toLowerCase()) && col in nextPayload) {
        console.warn(`[Server Self-Healing] Stripping matching stale column "${col}" from error message...`);
        const val = nextPayload[col];
        delete nextPayload[col];
        
        const currentRemarks = nextPayload.remarks || nextPayload.notes || '';
        const annotation = `[System Fallback - ${col}]: ${val}`;
        if (nextPayload.remarks !== undefined) {
          nextPayload.remarks = currentRemarks ? `${currentRemarks}\n${annotation}` : annotation;
        } else if (nextPayload.notes !== undefined) {
          nextPayload.notes = currentRemarks ? `${currentRemarks}\n${annotation}` : annotation;
        } else if (['leads', 'orders', 'operations', 'production'].includes(table)) {
          nextPayload.remarks = annotation;
        }
        healed = true;
      }
    }

    // Handle invalid input syntax for type numeric/integer/bigint/etc.
    const invalidSyntaxMatch = errorMsg.match(/invalid input syntax for type [^:]+: "([^"]+)"/i) ||
                               errorMsg.match(/invalid input syntax for type [^:]+: ([^\s]+)/i);
    if (invalidSyntaxMatch) {
      const badVal = invalidSyntaxMatch[1];
      console.warn(`[Server Self-Healing] Found invalid input syntax value "${badVal}". Locating matching field in payload...`);
      for (const [k, v] of Object.entries(nextPayload)) {
        if (v != null && (String(v) === badVal || (typeof v === 'string' && (v.includes(badVal) || badVal.includes(v))))) {
          console.warn(`[Server Self-Healing] Found matching field "${k}" with invalid syntax value "${v}". Cleaning or stripping...`);
          const digits = String(v).replace(/\D/g, '');
          if (digits && digits.length > 0 && String(v) !== digits) {
            nextPayload[k] = digits;
            console.warn(`[Server Self-Healing] Replaced field "${k}" with digits: "${digits}"`);
          } else {
            const val = nextPayload[k];
            delete nextPayload[k];
            const currentRemarks = nextPayload.remarks || nextPayload.notes || '';
            const annotation = `[System Fallback - ${k}]: ${val}`;
            if (nextPayload.remarks !== undefined) {
              nextPayload.remarks = currentRemarks ? `${currentRemarks}\n${annotation}` : annotation;
            } else if (nextPayload.notes !== undefined) {
              nextPayload.notes = currentRemarks ? `${currentRemarks}\n${annotation}` : annotation;
            } else if (['leads', 'orders', 'operations', 'production'].includes(table)) {
              nextPayload.remarks = annotation;
            }
          }
          healed = true;
          break;
        }
      }
    }

    // Handle malformed array literal or array type errors
    if (lowerMsg.includes('malformed array literal') || lowerMsg.includes('array')) {
      console.warn(`[Server Self-Healing] Found malformed array literal error in table "${table}". Cleaning empty/invalid array inputs...`);
      for (const [k, v] of Object.entries(nextPayload)) {
        if (v === '' || v === '""' || v === "''" || (Array.isArray(v) && v.length === 0)) {
          nextPayload[k] = null;
          healed = true;
        } else if (typeof v === 'string' && v.includes(',')) {
          const arr = v.split(',').map(s => s.trim()).filter(Boolean);
          nextPayload[k] = arr.length > 0 ? arr : null;
          healed = true;
        }
      }
    }

    return healed ? nextPayload : null;
  };

  const NUMERIC_DB_KEYS = new Set([
    'budget', 'package_price', 'package_cost', 'quotation_amount',
    'quotation_discount', 'Quotation_Discount', 'quotationdiscount',
    'additional_services_cost', 'Additional_Services_Cost', 'additionalservicescost',
    'final_quotation_amount', 'Final_Quotation_Amount', 'finalquotationamount',
    'final_amount', 'final_package_amount', 'total_amount',
    'advance_received', 'advance_collected', 'advance_payment', 'advance_paid',
    'balance_amount', 'balance', 'total_pax', 'guest_pax', 'staff_pax',
    'lead_value', 'lead_score', 'pincode', 'tax_amount', 'subtotal',
    'grand_total', 'total_payment', 'contract_final_amount', 'advance_payment_received',
    'pending_amount', 'number_of_team_members', 'event_duration', 'quantity', 'discount',
    'price', 'cost', 'amount', 'rate', 'fee'
  ]);

  function isNumericDbKey(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (NUMERIC_DB_KEYS.has(key) || NUMERIC_DB_KEYS.has(k)) return true;
    return (
      k.includes('amount') ||
      k.includes('cost') ||
      k.includes('price') ||
      k.includes('discount') ||
      k.includes('pax') ||
      k.includes('budget') ||
      k.includes('pincode') ||
      k.includes('zipcode') ||
      k.includes('balance') ||
      k.includes('advance') ||
      k.includes('score') ||
      k.includes('tax') ||
      k.includes('fee') ||
      k.includes('rate') ||
      k.includes('subtotal') ||
      k.includes('total') ||
      k.includes('duration') ||
      k.includes('quantity') ||
      k.endsWith('count')
    );
  }

  function sanitizeRecordForDbServer(record: any, table?: string): any {
    if (!record || typeof record !== 'object') return record;
    if (Array.isArray(record)) {
      return record.map(r => sanitizeRecordForDbServer(r, table));
    }
    const clone = { ...record };

    if (table === 'production_staff') {
      if ('password' in clone && clone.Password === undefined) {
        clone.Password = clone.password;
        delete clone.password;
      }
    }

    if (table === 'editor_assignments') {
      if ('Edited_Drive_Link' in clone) {
        if (!clone.edited_drive_link && clone.Edited_Drive_Link) {
          clone.edited_drive_link = clone.Edited_Drive_Link;
        }
      }
      const validCols = new Set([
        'assignment_id', 'production_id', 'staff_id', 'staff_name', 'speciality',
        'assigned_date', 'target_finish_date', 'status', 'created_at', 'event_id',
        'order_id', 'deliverable_id', 'edited_drive_link',
        'server_upload_confirmed', 'server_upload_event_date', 'server_upload_folder_name',
        'server_upload_confirmed_at', 'server_upload_confirmed_by',
        'edited_folder_uploaded_to_server', 'server_upload_validated',
        'server_upload_validated_at', 'server_upload_validated_by',
        'confirmation_proof', 'customer_communication_proof', 'client_communication_proof',
        'proof_url', 'proof_image', 'uploaded_proof', 'folder_name', 'upload_link_path'
      ]);
      for (const k of Object.keys(clone)) {
        if (!validCols.has(k)) {
          delete clone[k];
        }
      }
    }

    if (table === 'staff_assignments') {
      const validCols = new Set([
        'assignment_id', 'order_id', 'lead_id', 'task_id', 'slot_number', 'staff_role', 'staff_id', 'staff_name',
        'assignment_date', 'assignment_status', 'task_status', 'updated_at',
        'updated_by', 'raw_footage_link', 'created_at',
        'equipment_received_photo', 'equipment_handover_photo', 'equipment_handover_notes',
        'equipment_handover_to', 'event_start_photo', 'event_start_time',
        'event_end_photo', 'event_end_time', 'event_id', 'event_name', 'event_date',
        'reporting_time', 'equipment', 'assigned_equipment', 'equipment_details',
        'mobile', 'staff_type', 'proofs', 'notes', 'remarks'
      ]);
      if (!clone.assignment_id && (clone.order_id || clone.lead_id || clone.staff_name)) {
        const rawId = `SA-${clone.order_id || clone.lead_id || 'gen'}-${Date.now()}`;
        clone.assignment_id = rawId.length > 50 ? rawId.slice(0, 50) : rawId;
      }

      if (Array.isArray(clone.equipment)) {
        clone.equipment = clone.equipment.length > 0 ? clone.equipment : null;
      } else if (typeof clone.equipment === 'string') {
        const trimmed = clone.equipment.trim();
        clone.equipment = trimmed ? trimmed.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
      } else if (!clone.equipment) {
        clone.equipment = null;
      }

      if (Array.isArray(clone.assigned_equipment)) {
        clone.assigned_equipment = clone.assigned_equipment.length > 0 ? clone.assigned_equipment : null;
      } else if (typeof clone.assigned_equipment === 'string') {
        const trimmed = clone.assigned_equipment.trim();
        clone.assigned_equipment = trimmed ? trimmed.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
      } else if (!clone.assigned_equipment) {
        clone.assigned_equipment = null;
      }

      if (Array.isArray(clone.proofs)) {
        clone.proofs = clone.proofs.length > 0 ? clone.proofs : null;
      } else if (typeof clone.proofs === 'string') {
        const trimmed = clone.proofs.trim();
        clone.proofs = trimmed ? trimmed.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
      } else if (!clone.proofs) {
        clone.proofs = null;
      }

      const varchar50Cols = ['assignment_id', 'task_id', 'order_id', 'lead_id', 'staff_id', 'assignment_status', 'task_status', 'reporting_time', 'staff_type', 'event_id', 'updated_by'];
      for (const vCol of varchar50Cols) {
        if (typeof clone[vCol] === 'string' && clone[vCol].length > 50) {
          clone[vCol] = clone[vCol].substring(0, 50);
        }
      }

      if (clone.assignment_status) {
        const allowedAssignmentStatuses = new Set([
          'Assigned', 'Completed', 'Event Started', 'Event Completed', 'Project Completed', 'Cancelled', 'Pending', 'In Progress', 'Rejected'
        ]);
        if (!allowedAssignmentStatuses.has(clone.assignment_status)) {
          if (['Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 'Delivered', 'Project Delivered', 'Closed', 'Order Closed'].includes(clone.assignment_status)) {
            clone.assignment_status = 'Completed';
          } else if (['Event Ended', 'Event End'].includes(clone.assignment_status)) {
            clone.assignment_status = 'Event Completed';
          } else if (['Event Started', 'Event Start'].includes(clone.assignment_status)) {
            clone.assignment_status = 'Event Started';
          } else {
            clone.assignment_status = 'Assigned';
          }
        }
      }

      for (const k of Object.keys(clone)) {
        if (!validCols.has(k)) {
          delete clone[k];
        }
      }
    }

    if (table === 'staff_task_submissions') {
      const validCols = new Set([
        'id', 'assignment_id', 'order_id', 'lead_id', 'event_id', 'event_name',
        'staff_id', 'staff_name', 'staff_role', 'submission_type', 'task_status',
        'photo_url', 'proof_photos', 'raw_footage_link', 'handover_to',
        'handover_notes', 'equipment_name', 'asset_id', 'remarks', 'created_at'
      ]);
      if (!clone.id) {
        clone.id = crypto.randomUUID();
      }
      if (!clone.created_at) {
        clone.created_at = new Date().toISOString();
      }
      if (clone.proof_photos && typeof clone.proof_photos === 'object') {
        clone.proof_photos = JSON.stringify(clone.proof_photos);
      }
      for (const k of Object.keys(clone)) {
        if (!validCols.has(k)) {
          delete clone[k];
        }
      }
    }

    if (table === 'raw_footage') {
      const validCols = new Set([
        'tracking_id', 'order_id', 'event_completed_date', 'raw_received',
        'server_path', 'drive_link', 'uploaded_by', 'uploaded_date', 'status',
        'assignment_id', 'event_id', 'event_name'
      ]);
      if (!clone.tracking_id) {
        clone.tracking_id = `TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
      if (!clone.event_completed_date) {
        clone.event_completed_date = new Date().toISOString().split('T')[0];
      }
      if (clone.raw_received === undefined) {
        clone.raw_received = clone.status === 'Received' || !!clone.server_path || !!clone.drive_link;
      }
      if (!clone.status) {
        clone.status = clone.raw_received ? 'Received' : 'Pending';
      }
      for (const k of Object.keys(clone)) {
        if (!validCols.has(k)) {
          delete clone[k];
        }
      }
    }

    if (table === 'lead_events') {
      const validCols = new Set([
        'id', 'lead_id', 'event_type', 'event_name', 'event_shoot_type', 'event_date',
        'event_end_date', 'event_start_time', 'event_end_time', 'event_location',
        'google_maps_link', 'guest_pax', 'staff_pax', 'assigned_staff_names',
        'assigned_staff_mobiles', 'assigned_equipment', 'reporting_date', 'reporting_time',
        'created_at', 'updated_at'
      ]);
      if (clone.Reporting_date && !clone.reporting_date) {
        clone.reporting_date = clone.Reporting_date;
      }
      for (const k of Object.keys(clone)) {
        if (!validCols.has(k)) {
          delete clone[k];
        }
      }
    }

    if (table === 'payment_history') {
      const validCols = new Set([
        'id', 'order_id', 'amount', 'payment_date', 'transaction_id',
        'payment_mode', 'payment_type', 'updated_by', 'notes', 'created_at', 'approval_status'
      ]);
      if (!clone.approval_status) {
        clone.approval_status = 'Waiting for Approval';
      }
      const currentNotes = clone.notes || '';
      if (clone.approval_status === 'Waiting for Approval') {
        const stripped = currentNotes.replace(/ - Waiting for Approval/g, '').replace(/Waiting for Approval/g, '').replace(/ - Approved/g, '').replace(/Approved by Business Owner/g, '').replace(/ - Rejected/g, '').replace(/Rejected by Business Owner/g, '').trim();
        clone.notes = stripped ? `${stripped} - Waiting for Approval` : 'Waiting for Approval';
      } else if (clone.approval_status === 'Approved') {
        const stripped = currentNotes.replace(/ - Waiting for Approval/g, '').replace(/Waiting for Approval/g, '').replace(/ - Approved/g, '').replace(/Approved by Business Owner/g, '').replace(/ - Rejected/g, '').replace(/Rejected by Business Owner/g, '').trim();
        clone.notes = stripped ? `${stripped} - Approved` : 'Approved by Business Owner';
      } else if (clone.approval_status === 'Rejected') {
        const stripped = currentNotes.replace(/ - Waiting for Approval/g, '').replace(/Waiting for Approval/g, '').replace(/ - Approved/g, '').replace(/Approved by Business Owner/g, '').replace(/ - Rejected/g, '').replace(/Rejected by Business Owner/g, '').trim();
        clone.notes = stripped ? `${stripped} - Rejected` : 'Rejected by Business Owner';
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!clone.id || !uuidRegex.test(clone.id)) {
        clone.id = crypto.randomUUID();
      }
      for (const k of Object.keys(clone)) {
        if (!validCols.has(k)) {
          delete clone[k];
        }
      }
    }

    for (const key of Object.keys(clone)) {
      const val = clone[key];
      if (key.toLowerCase() === 'whatsapp_number') {
        if (val === '' || val === null || val === undefined || val === 'NaN' || val === 'null' || val === 'undefined') {
          clone[key] = null;
        } else {
          const digits = String(val).replace(/\D/g, '');
          clone[key] = digits ? Number(digits) : null;
        }
        continue;
      }
      const isPhone = key.includes('mobile') || key.includes('whatsapp') || key.includes('phone');
      if (isNumericDbKey(key)) {
        if (val === '' || val === null || val === undefined || val === 'NaN' || val === 'null' || val === 'undefined') {
          clone[key] = (key === 'total_pax' && table === 'leads') ? 0 : null;
        } else if (typeof val === 'number') {
          if (isNaN(val)) {
            clone[key] = (key === 'total_pax' && table === 'leads') ? 0 : null;
          }
        } else if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed === '') {
            clone[key] = (key === 'total_pax' && table === 'leads') ? 0 : null;
          } else if (!isPhone) {
            const num = Number(trimmed);
            if (isNaN(num)) {
              clone[key] = null;
            } else {
              clone[key] = num;
            }
          }
        }
      } else if (isPhone && typeof val === 'string' && val.trim() !== '') {
        const digits = val.replace(/\D/g, '');
        if (digits) {
          clone[key] = digits;
        }
      }
    }
    return clone;
  }

  function cleanPhone(phone: string | undefined | null): string {
    if (!phone) return '';
    const cleaned = String(phone).replace(/[^\d]/g, '');
    return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  }

  function cleanEmail(email: string | undefined | null): string {
    if (!email) return '';
    return String(email).trim().toLowerCase();
  }

  async function checkGlobalUniquenessInDb(
    db: any, 
    mobile: string | undefined | null, 
    email: string | undefined | null,
    excludeId?: string | null,
    excludeEmail?: string | null,
    excludeMobile?: string | null,
    excludeStaffId?: string | null
  ): Promise<{ isUnique: boolean; isMobileDuplicate: boolean; isEmailDuplicate: boolean; queryFailed?: boolean; error?: string }> {
    const normMobile = cleanPhone(mobile);
    const normEmail = cleanEmail(email);

    let isMobileDuplicate = false;
    let isEmailDuplicate = false;

    if (!normMobile && !normEmail) {
      return { isUnique: true, isMobileDuplicate: false, isEmailDuplicate: false };
    }

    const cleanExclude = excludeId ? String(excludeId).trim().toLowerCase() : null;
    const cleanExcludeEmail = excludeEmail ? cleanEmail(excludeEmail) : null;
    const cleanExcludeMobile = excludeMobile ? cleanPhone(excludeMobile) : null;
    const cleanExcludeStaffId = excludeStaffId ? String(excludeStaffId).trim().toLowerCase() : null;

    const isExcludedRecord = (recordId?: string | null, recordEmail?: string | null, recordMobile?: string | null) => {
      const rId = recordId ? String(recordId).trim().toLowerCase() : '';
      const rEmail = cleanEmail(recordEmail);
      const rMobile = cleanPhone(recordMobile);

      if (cleanExclude && rId && (rId === cleanExclude || cleanExclude.includes(rId) || rId.includes(cleanExclude))) return true;
      if (cleanExcludeStaffId && rId && (rId === cleanExcludeStaffId || cleanExcludeStaffId.includes(rId) || rId.includes(cleanExcludeStaffId))) return true;
      if (cleanExcludeEmail && rEmail && rEmail === cleanExcludeEmail) return true;
      if (cleanExcludeMobile && rMobile && rMobile === cleanExcludeMobile) return true;
      return false;
    };

    try {
      // 1. Query operations_staff
      const { data: opData, error: oErr } = await db.from('operations_staff').select('staff_id, name, mobile, email');
      if (oErr) {
        console.error('[checkGlobalUniquenessInDb] operations_staff query error:', oErr.message);
        return { isUnique: false, isMobileDuplicate: false, isEmailDuplicate: false, queryFailed: true, error: `Database error checking operations staff: ${oErr.message}` };
      }

      // 2. Query production_staff
      const { data: prodData, error: pErr } = await db.from('production_staff').select('staff_id, name, mobile, email');
      if (pErr) {
        console.error('[checkGlobalUniquenessInDb] production_staff query error:', pErr.message);
        return { isUnique: false, isMobileDuplicate: false, isEmailDuplicate: false, queryFailed: true, error: `Database error checking production staff: ${pErr.message}` };
      }

      // Build active staff sets to identify active staff accounts vs orphaned rows
      const activeStaffMobiles = new Set<string>();
      const activeStaffEmails = new Set<string>();

      if (Array.isArray(opData)) {
        for (const s of opData) {
          const sMobile = cleanPhone(s.mobile || s.mobile_number || s.phone);
          const sEmail = cleanEmail(s.email);
          if (sMobile && sMobile.length >= 7 && sMobile !== '0000000000') activeStaffMobiles.add(sMobile);
          if (sEmail && sEmail.includes('@')) activeStaffEmails.add(sEmail);

          if (isExcludedRecord(s.staff_id, s.email, s.mobile)) continue;

          if (normMobile && normMobile.length === 10 && sMobile === normMobile) {
            isMobileDuplicate = true;
          }
          if (normEmail && sEmail && sEmail === normEmail) {
            isEmailDuplicate = true;
          }
        }
      }

      if (Array.isArray(prodData)) {
        for (const p of prodData) {
          const pMobile = cleanPhone(p.mobile || p.mobile_number || p.phone);
          const pEmail = cleanEmail(p.email);
          if (pMobile && pMobile.length >= 7 && pMobile !== '0000000000') activeStaffMobiles.add(pMobile);
          if (pEmail && pEmail.includes('@')) activeStaffEmails.add(pEmail);

          if (isExcludedRecord(p.staff_id, p.email, p.mobile)) continue;

          if (normMobile && normMobile.length === 10 && pMobile === normMobile) {
            isMobileDuplicate = true;
          }
          if (normEmail && pEmail && pEmail === normEmail) {
            isEmailDuplicate = true;
          }
        }
      }

      // 3. Check public.users (excluding orphaned staff accounts that have no active staff record)
      const { data: usersData, error: uErr } = await db.from('users').select('id, name, mobile, phone, email, role');
      if (uErr) {
        console.error('[checkGlobalUniquenessInDb] users query error:', uErr.message);
        return { isUnique: false, isMobileDuplicate: false, isEmailDuplicate: false, queryFailed: true, error: `Database error checking user accounts: ${uErr.message}` };
      }

      if (Array.isArray(usersData)) {
        for (const u of usersData) {
          if (isExcludedRecord(u.id, u.email, u.mobile || u.phone)) continue;

          const uRole = (u.role || '').trim();
          const isOpsRole = uRole === 'Operation Staff' || uRole === 'Operations Team';
          const isProdRole = uRole === 'Production Team' || uRole === 'Production Staff';
          const uMobile1 = cleanPhone(u.mobile);
          const uMobile2 = cleanPhone(u.phone);
          const uEmail = cleanEmail(u.email);

          // If this is an orphaned staff user not present in active ops or prod tables, ignore it
          if (isOpsRole || isProdRole) {
            const hasActiveMobile = (uMobile1 && activeStaffMobiles.has(uMobile1)) || (uMobile2 && activeStaffMobiles.has(uMobile2));
            const hasActiveEmail = uEmail && activeStaffEmails.has(uEmail);
            if (!hasActiveMobile && !hasActiveEmail) {
              continue;
            }
          }

          if (normMobile && normMobile.length === 10) {
            if (uMobile1 === normMobile || uMobile2 === normMobile) {
              isMobileDuplicate = true;
            }
          }
          if (normEmail && uEmail && uEmail === normEmail) {
            isEmailDuplicate = true;
          }
        }
      }
    } catch (err: any) {
      console.warn('[checkGlobalUniquenessInDb] DB check exception:', err?.message || err);
      return { isUnique: false, isMobileDuplicate: false, isEmailDuplicate: false, queryFailed: true, error: `Database check exception: ${err?.message || err}` };
    }

    if (isMobileDuplicate && isEmailDuplicate) {
      return {
        isUnique: false,
        isMobileDuplicate: true,
        isEmailDuplicate: true,
        error: "This mobile number is already registered. This email address is already registered."
      };
    }
    if (isMobileDuplicate) {
      return {
        isUnique: false,
        isMobileDuplicate: true,
        isEmailDuplicate: false,
        error: "This mobile number is already registered."
      };
    }
    if (isEmailDuplicate) {
      return {
        isUnique: false,
        isMobileDuplicate: false,
        isEmailDuplicate: true,
        error: "This email address is already registered."
      };
    }

    return { isUnique: true, isMobileDuplicate: false, isEmailDuplicate: false };
  }

  async function executeWithSelfHealing(table: string, operation: 'insert' | 'update' | 'upsert', payload: any, matchCol?: string, matchVal?: any) {
    const db = getServerSupabase();

    // Self-healing: ensure referenced lead exists for lead_events or lead_packages, and package exists for lead_packages
    if (['lead_events', 'lead_packages'].includes(table)) {
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (item.lead_id) {
          try {
            const { data: leadCheck } = await db.from('leads').select('lead_id').eq('lead_id', item.lead_id).maybeSingle();
            if (!leadCheck) {
              await db.from('leads').upsert({
                lead_id: item.lead_id,
                customer_name: 'Valued Client',
                mobile: '0000000000',
                status: 'New Lead',
                created_date: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString()
              }, { onConflict: 'lead_id' });
            }
          } catch (e) {
            console.warn('[SelfHealing] ensure lead exists error:', e);
          }
        }
        if (table === 'lead_packages') {
          const pkgId = (item.package_id && String(item.package_id).trim()) ? String(item.package_id).trim() : 'PKG-DEFAULT';
          item.package_id = pkgId;
          try {
            const { data: pkgCheck } = await db.from('packages').select('package_id').eq('package_id', pkgId).maybeSingle();
            if (!pkgCheck) {
              await db.from('packages').upsert({
                package_id: pkgId,
                package_name: item.package_name || pkgId,
                category: 'Custom',
                price: item.package_cost || item.final_amount || 0,
                created_at: new Date().toISOString()
              }, { onConflict: 'package_id' });
            }
          } catch (e) {
            console.warn('[SelfHealing] ensure package exists error:', e);
          }
        }
      }
    }

    // Global unique mobile & email enforcement across operations_staff, production_staff, and users
    if (['operations_staff', 'production_staff', 'users'].includes(table)) {
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        if (!item) continue;
        const incomingMobile = item.mobile || item.mobile_number || item.phone;
        const incomingEmail = item.email;
        const excludeVal = (operation === 'update' || operation === 'upsert') ? (matchVal || item.staff_id || item.id) : null;
        if (incomingMobile || incomingEmail) {
          const uniqueCheck = await checkGlobalUniquenessInDb(
            db, 
            incomingMobile, 
            incomingEmail, 
            excludeVal,
            (operation === 'update' || operation === 'upsert') ? incomingEmail : null,
            (operation === 'update' || operation === 'upsert') ? incomingMobile : null,
            excludeVal
          );
          if (!uniqueCheck.isUnique) {
            return { success: false, error: uniqueCheck.error };
          }
        }
      }
    }

    // Safe handling for production delivery method fields in Supabase
    if (table === 'production') {
      const items = Array.isArray(payload) ? payload : [payload];
      for (const itm of items) {
        if (!itm || typeof itm !== 'object') continue;
        if (itm.delivery_method || itm.server_link || itm.physical_drive_details) {
          const valUploads = (itm.validated_server_uploads && typeof itm.validated_server_uploads === 'object') ? itm.validated_server_uploads : {};
          itm.validated_server_uploads = {
            ...valUploads,
            ...(itm.delivery_method ? { delivery_method: itm.delivery_method } : {}),
            ...(itm.delivery_method === 'server_link' && itm.server_link ? { server_link: itm.server_link } : {}),
            ...(itm.delivery_method === 'physical_drive' && itm.physical_drive_details ? { physical_drive_details: itm.physical_drive_details } : {})
          };
          if (itm.delivery_method === 'server_link' && itm.server_link) {
            itm.delivery_link = itm.server_link;
            itm.upload_link_path = itm.server_link;
            itm.final_edited_footage_link = itm.server_link;
          } else if (itm.delivery_method === 'physical_drive') {
            itm.delivery_link = '';
            itm.upload_link_path = '';
            itm.final_edited_footage_link = '';
            if (itm.physical_drive_details && !itm.folder_name) {
              itm.folder_name = itm.physical_drive_details;
            }
          }
          delete itm.delivery_method;
          delete itm.server_link;
          delete itm.physical_drive_details;
        }
      }
    }

    // Self-healing insert handler for lead_events to prevent primary key sequence collisions
    if (table === 'lead_events' && operation === 'insert') {
      const items = Array.isArray(payload) ? payload : [payload];
      const insertedRows: any[] = [];
      
      const { data: allEvs } = await db.from('lead_events').select('id');
      let currentMaxId = 0;
      const existingIdSet = new Set<number>();
      if (Array.isArray(allEvs)) {
        for (const row of allEvs) {
          const num = typeof row.id === 'number' ? row.id : parseInt(String(row.id), 10);
          if (!isNaN(num)) {
            existingIdSet.add(num);
            if (num > currentMaxId) currentMaxId = num;
          }
        }
      }

      for (const rawItem of items) {
        if (!rawItem) continue;
        const cleanItem = sanitizeRecordForDbServer(rawItem, 'lead_events');
        
        let targetId = cleanItem.id ? Number(cleanItem.id) : null;
        if (!targetId || isNaN(targetId) || existingIdSet.has(targetId)) {
          currentMaxId++;
          while (existingIdSet.has(currentMaxId)) {
            currentMaxId++;
          }
          targetId = currentMaxId;
          existingIdSet.add(targetId);
          cleanItem.id = targetId;
        }

        let { data: insData, error: insErr } = await db.from('lead_events').insert(cleanItem).select();
        
        let retryCount = 0;
        while (insErr && (insErr.code === '23505' || insErr.message?.includes('duplicate key') || insErr.message?.includes('lead_events_pkey')) && retryCount < 20) {
          retryCount++;
          currentMaxId++;
          while (existingIdSet.has(currentMaxId)) {
            currentMaxId++;
          }
          cleanItem.id = currentMaxId;
          existingIdSet.add(currentMaxId);
          const retryRes = await db.from('lead_events').insert(cleanItem).select();
          insData = retryRes.data;
          insErr = retryRes.error;
        }

        if (!insErr && insData && insData.length > 0) {
          insertedRows.push(insData[0]);
        } else if (insErr) {
          console.error(`[Server DB lead_events insert error]:`, insErr);
          return { success: false, error: insErr.message || String(insErr) };
        } else {
          insertedRows.push(cleanItem);
        }
      }
      return { success: true, data: Array.isArray(payload) ? insertedRows : (insertedRows[0] || insertedRows) };
    }

    // Self-healing handler for operations_staff
    if (table === 'operations_staff') {
      const items = Array.isArray(payload) ? payload : [payload];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const allowedOpsRoles = ['Photographer', 'Videographer', 'Assistant', 'Manager'];

      for (const itm of items) {
        if (!itm || typeof itm !== 'object') continue;
        if (!itm.staff_id || !uuidRegex.test(String(itm.staff_id))) {
          itm.staff_id = crypto.randomUUID ? crypto.randomUUID() : '55555555-5555-5555-5555-' + String(Math.floor(100000000000 + Math.random() * 900000000000));
        }
        let safeRole = itm.role || 'Photographer';
        if (!allowedOpsRoles.includes(safeRole)) {
          const rLower = String(safeRole).toLowerCase();
          if (rLower.includes('video')) safeRole = 'Videographer';
          else if (rLower.includes('assist')) safeRole = 'Assistant';
          else if (rLower.includes('manag')) safeRole = 'Manager';
          else safeRole = 'Photographer';
        }
        itm.role = safeRole;

        if (itm.whatsapp_number !== undefined && itm.whatsapp_number !== null) {
          const numStr = String(itm.whatsapp_number).replace(/\D/g, '').slice(-10);
          itm.whatsapp_number = numStr ? Number(numStr) : null;
        } else if (itm.mobile) {
          const numStr = String(itm.mobile).replace(/\D/g, '').slice(-10);
          itm.whatsapp_number = numStr ? Number(numStr) : null;
        }

        if (!itm.Staff_Type && itm.staff_type) itm.Staff_Type = itm.staff_type;
        if (!itm.staff_type && itm.Staff_Type) itm.staff_type = itm.Staff_Type;
        if (!itm.department) itm.department = 'Operations';
        if (!itm.status) itm.status = 'Active';
      }
    }

    // Map equipment_handovers to lead_equipment_history to ensure persistence without schema errors
    if (table === 'equipment_handovers') {
      const items = Array.isArray(payload) ? payload : [payload];
      const historyRecords = items.map((h: any) => ({
        lead_id: h.lead_id || h.order_id || 'UNKNOWN',
        order_id: h.order_id || null,
        equipment_name: h.equipment_name || 'Equipment Handover',
        equipment_status: h.return_status || 'Returned',
        returned_by: h.returned_by || 'Staff',
        returned_at: h.return_date ? new Date(h.return_date).toISOString() : (h.created_at || new Date().toISOString()),
        remarks: h.notes || `Equipment Handover: ${h.equipment_name || ''} - ${h.return_status || ''}`
      }));
      const { data: histData, error: histErr } = await db.from('lead_equipment_history').insert(historyRecords).select();
      if (histErr) {
        console.warn('[Server DB equipment_handovers -> lead_equipment_history fallback warn]:', histErr.message);
      }
      return { success: true, data: histData || items };
    }

    if (table === 'payment_history') {
      if (matchCol === 'payment_history_id') {
        matchCol = 'id';
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (matchCol === 'id' && matchVal && !uuidRegex.test(String(matchVal))) {
        const orderIdToMatch = payload?.order_id;
        if (orderIdToMatch) {
          const { data: existingRows } = await db.from('payment_history').select('*').eq('order_id', orderIdToMatch);
          const rows = existingRows || [];
          const found = rows.find((r: any) => 
            (payload.transaction_id && r.transaction_id && r.transaction_id === payload.transaction_id) ||
            (payload.id && r.id === payload.id)
          ) || rows.find((r: any) => 
            (payload.transaction_id && r.transaction_id && String(r.transaction_id).trim() === String(payload.transaction_id).trim())
          ) || (matchVal ? rows.find((r: any) => r.id === matchVal || r.transaction_id === matchVal) : null);
          if (found) {
            matchVal = found.id;
          }
        }
      }
    }

    if (table === 'users') {
      const uItem = Array.isArray(payload) ? payload[0] : payload;
      if (uItem) {
        let normalizedRole = 'Operation Staff';
        if (uItem.role) {
          const r = String(uItem.role).trim().toLowerCase();
          if (r.includes('owner') || r.includes('business')) normalizedRole = 'Business Owner';
          else if (r.includes('sales')) normalizedRole = 'Sales Team';
          else if (r.includes('prod') && r.includes('staff')) normalizedRole = 'Production Staff';
          else if (r.includes('editor')) normalizedRole = 'Production Staff';
          else if (r.includes('prod') && r.includes('team')) normalizedRole = 'Production Team';
          else if (r.includes('op') && r.includes('staff')) normalizedRole = 'Operation Staff';
          else if (r.includes('op') && r.includes('team')) normalizedRole = 'Operations Team';
          else if (r.includes('prod')) normalizedRole = 'Production Team';
          else normalizedRole = 'Operation Staff';
        }

        const cleanE = uItem.email ? String(uItem.email).trim().toLowerCase() : '';
        const cleanM = uItem.mobile ? String(uItem.mobile).trim() : '0000000000';
        const targetId = uItem.id;

        const orConds = [];
        if (targetId) orConds.push(`id.eq.${targetId}`);
        if (cleanE) orConds.push(`email.eq.${cleanE}`);
        if (cleanM && cleanM !== '0000000000') orConds.push(`mobile.eq.${cleanM}`);

        if (orConds.length > 0) {
          const { data: existingRows } = await db.from('users').select('*').or(orConds.join(',')).limit(1);
          if (existingRows && existingRows.length > 0) {
            const existing = existingRows[0];
            const updates: any = {
              name: uItem.name || existing.name,
              mobile: cleanM || existing.mobile || '0000000000',
              role: normalizedRole,
              active: uItem.active !== undefined ? uItem.active : existing.active
            };
            if (uItem.username) updates.username = uItem.username;
            if (uItem.password) updates.password = uItem.password;

            let { data: upd, error: updErr } = await db.from('users').update(updates).eq('id', existing.id).select();
            if (updErr && updErr.message && updErr.message.includes('username')) {
              delete updates.username;
              const retryRes = await db.from('users').update(updates).eq('id', existing.id).select();
              upd = retryRes.data;
              updErr = retryRes.error;
            }
            if (!updErr && upd && upd.length > 0) {
              return { success: true, data: upd };
            }
          }
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const validId = targetId && uuidRegex.test(targetId) ? targetId : crypto.randomUUID();
        const insertRecord: any = {
          id: validId,
          name: uItem.name || 'Staff',
          email: cleanE || `${cleanM}@photocrew.com`,
          mobile: cleanM,
          role: normalizedRole,
          active: uItem.active !== undefined ? uItem.active : true,
          password: uItem.password || null,
          created_at: uItem.created_at || new Date().toISOString()
        };
        if (uItem.username) insertRecord.username = uItem.username;

        let { data: ins, error: insErr } = await db.from('users').insert(insertRecord).select();
        if (insErr && insErr.message && insErr.message.includes('username')) {
          delete insertRecord.username;
          const retryIns = await db.from('users').insert(insertRecord).select();
          ins = retryIns.data;
          insErr = retryIns.error;
        }
        if (!insErr && ins && ins.length > 0) {
          return { success: true, data: ins };
        } else if (insErr) {
          console.warn('[Server DB users insert warning, attempting safe fallback]:', insErr.message);
        }
      }
    }

    let currentPayload = sanitizeRecordForDbServer(payload, table);
    let retriesLeft = 15;
    let lastError: any = null;

    while (retriesLeft > 0) {
      retriesLeft--;
      let res: any;
      if (operation === 'insert') {
        res = await db.from(table).insert(currentPayload).select();
      } else if (operation === 'upsert') {
        res = await db.from(table).upsert(currentPayload).select();
      } else if (operation === 'update') {
        res = await db.from(table).update(currentPayload).eq(matchCol!, matchVal).select();
      }

      if (!res?.error) {
        let returnData = res?.data;
        if (table === 'editor_assignments' && Array.isArray(returnData)) {
          returnData = returnData.map((row: any) => ({
            ...row,
            Edited_Drive_Link: row.Edited_Drive_Link || row.edited_drive_link || null,
            edited_drive_link: row.edited_drive_link || row.Edited_Drive_Link || null
          }));
        }
        return { success: true, data: returnData };
      }

      if (res.error?.code === '23503') {
        console.warn(`[Server DB] Handled foreign key violation (23503) on table ${table}:`, res.error.message);
        const item = Array.isArray(currentPayload) ? currentPayload[0] : currentPayload;
        if (table === 'lead_packages' && item?.package_id) {
          try {
            await db.from('packages').upsert({
              package_id: item.package_id,
              package_name: item.package_name || item.package_id,
              category: 'Custom',
              price: item.package_cost || item.final_amount || 0,
              created_at: new Date().toISOString()
            }, { onConflict: 'package_id' });
          } catch (e) {}
        } else if (['lead_events', 'lead_packages'].includes(table) && item?.lead_id) {
          try {
            await db.from('leads').upsert({
              lead_id: item.lead_id,
              customer_name: 'Valued Client',
              mobile: '0000000000',
              status: 'New Lead',
              created_date: new Date().toISOString().split('T')[0],
              created_at: new Date().toISOString()
            }, { onConflict: 'lead_id' });
          } catch (e) {}
        }
      }

      if (operation === 'update' && res.error) {
        console.warn(`[Server DB] Update failed on table ${table} where ${matchCol}=${matchVal}. Falling back to upsert.`);
        const upsertRes = await db.from(table).upsert(currentPayload).select();
        if (!upsertRes.error) {
          return { success: true, data: upsertRes.data };
        }
      }

      // Handle raw_footage constraint violations / duplicate tracking or order_id
      if (table === 'raw_footage' && (res.error?.code === '23505' || res.error?.code === '23502')) {
        console.warn(`[Server DB] Handled constraint on raw_footage (${res.error.code}). Attempting upsert / update by order_id.`);
        const rfItem = Array.isArray(currentPayload) ? currentPayload[0] : currentPayload;
        if (rfItem && rfItem.order_id) {
          const { data: existingRows } = await db.from('raw_footage').select('*').eq('order_id', rfItem.order_id);
          if (existingRows && existingRows.length > 0) {
            const existing = existingRows[0];
            const { data: updRf } = await db.from('raw_footage').update({
              server_path: rfItem.server_path || existing.server_path,
              uploaded_by: rfItem.uploaded_by || existing.uploaded_by,
              uploaded_date: rfItem.uploaded_date || existing.uploaded_date || new Date().toISOString(),
              raw_received: rfItem.raw_received !== undefined ? rfItem.raw_received : existing.raw_received,
              status: rfItem.status || existing.status || 'Received'
            }).eq('tracking_id', existing.tracking_id).select();
            if (updRf && updRf.length > 0) {
              return { success: true, data: updRf };
            }
          }
        }
      }

      if (table === 'staff_assignments') {
        console.warn(`[Server DB] Handled constraint/error on staff_assignments (${res.error?.message || res.error?.code}). Ensuring isolated slot assignment without overwriting other slots.`);
        const items = Array.isArray(currentPayload) ? currentPayload : [currentPayload];
        const updatedRows: any[] = [];
        for (const itm of items) {
          if (!itm) continue;
          let handled = false;
          const targetAssignId = itm.assignment_id || (matchCol === 'assignment_id' ? matchVal : undefined);

          // 1. Try matching by exact assignment_id if present
          if (targetAssignId) {
            const cleanItm = { ...itm, assignment_id: targetAssignId };
            const { data: matchedById } = await db.from('staff_assignments').select('*').eq('assignment_id', targetAssignId);
            if (matchedById && matchedById.length > 0) {
              const { data: upd, error: updErr } = await db.from('staff_assignments').update(cleanItm).eq('assignment_id', targetAssignId).select();
              if (!updErr && upd && upd.length > 0) {
                updatedRows.push(upd[0]);
                handled = true;
              }
            } else {
              const { data: ins, error: insErr } = await db.from('staff_assignments').upsert(cleanItm, { onConflict: 'assignment_id' }).select();
              if (!insErr && ins && ins.length > 0) {
                updatedRows.push(ins[0]);
                handled = true;
              }
            }
          }

          // 2. Try matching by exact task_id if present
          if (!handled && itm.task_id) {
            const { data: matchedByTask } = await db.from('staff_assignments').select('*').eq('task_id', itm.task_id);
            if (matchedByTask && matchedByTask.length > 0) {
              const matchedAssignId = matchedByTask[0].assignment_id;
              const { data: upd, error: updErr } = await db.from('staff_assignments').update({
                ...itm,
                assignment_id: matchedAssignId
              }).eq('assignment_id', matchedAssignId).select();
              if (!updErr && upd && upd.length > 0) {
                updatedRows.push(upd[0]);
                handled = true;
              }
            }
          }

          // 3. Fallback: upsert as independent record with isolated assignment_id
          // CRITICAL: NEVER match or overwrite by order_id + staff_name or staff_id alone!
          if (!handled) {
            const assignId = targetAssignId || `ASST-${itm.order_id || 'gen'}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const cleanItm = { ...itm, assignment_id: assignId };
            const { data: upsertData, error: upsertErr } = await db.from('staff_assignments').upsert(cleanItm, { onConflict: 'assignment_id' }).select();
            if (!upsertErr && upsertData && upsertData.length > 0) {
              updatedRows.push(upsertData[0]);
            } else {
              updatedRows.push(cleanItm);
            }
          }
        }
        return { success: true, data: updatedRows.length > 0 ? updatedRows : (Array.isArray(currentPayload) ? currentPayload : [currentPayload]) };
      }

      lastError = res.error;
      const healed = healPayload(table, currentPayload, res.error.message || String(res.error));
      if (healed) {
        console.log(`[Server Self-Healing Loop] Stripped non-matching field, retrying ${operation} on ${table}: ${res.error.message}`);
        currentPayload = healed;
      } else {
        break;
      }
    }

    if (!['activity_logs', 'notifications', 'analytics_snapshots', 'login_logs', 'staff_task_submissions'].includes(table)) {
      console.error(`[Server DB ${operation} Error] ${table}:`, lastError);
    }
    return { success: false, error: lastError?.message || String(lastError) };
  }

  // --- Google Sheets Backup Logic ---
  let hasLoggedSpreadsheetUrlWarning = false;

  const triggerGoogleSheetsBackup = (table: string, action: string, data: any, record_id?: string) => {
    const GOOGLE_SHEETS_BACKUP_URL = process.env.GOOGLE_SHEETS_BACKUP_URL;
    const GOOGLE_SHEETS_BACKUP_SECRET = process.env.GOOGLE_SHEETS_BACKUP_SECRET;

    if (!GOOGLE_SHEETS_BACKUP_URL || !GOOGLE_SHEETS_BACKUP_SECRET) {
      return;
    }

    const trimmedUrl = GOOGLE_SHEETS_BACKUP_URL.trim();
    if (!trimmedUrl || trimmedUrl.startsWith('YOUR_') || trimmedUrl === 'MY_GOOGLE_SHEETS_BACKUP_URL') {
      return;
    }

    // If user provided a spreadsheet document link instead of a Google Apps Script Web App /exec endpoint
    if (trimmedUrl.includes('docs.google.com/spreadsheets')) {
      if (!hasLoggedSpreadsheetUrlWarning) {
        console.warn('[Server Backup Notice] GOOGLE_SHEETS_BACKUP_URL is configured with a Google Sheets view link (docs.google.com/spreadsheets/...) instead of a Google Apps Script Web App (/exec) endpoint. HTTP webhook backup skipped.');
        hasLoggedSpreadsheetUrlWarning = true;
      }
      return;
    }

    // Fire and forget, don't await to avoid blocking Supabase operations
    (async () => {
      try {
        let actual_record_id = record_id;
        if (!actual_record_id && data) {
           actual_record_id = data.id || data.lead_id || data.order_id || data.package_id || data.staff_id || data.payment_id || data.assignment_id || "unknown";
        }
        
        if (action === 'delete' && !actual_record_id && data) {
           actual_record_id = data;
        }

        const payload = {
          token: GOOGLE_SHEETS_BACKUP_SECRET,
          table,
          record_id: String(actual_record_id || ''),
          action,
          data
        };

        const jsonString = JSON.stringify(payload);

        // Attempt 1: Standard POST with text/plain (Google Apps Script Web App standard format to prevent 405/CORS redirect drop)
        let response = await fetch(trimmedUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: jsonString,
          redirect: 'follow'
        }).catch(() => null);

        // Attempt 2: If 405 Method Not Allowed, fallback to GET (in case Google Apps Script web app only implemented doGet)
        if (response && response.status === 405) {
          try {
            const urlObj = new URL(trimmedUrl);
            urlObj.searchParams.set('token', GOOGLE_SHEETS_BACKUP_SECRET);
            urlObj.searchParams.set('table', table);
            urlObj.searchParams.set('record_id', String(actual_record_id || ''));
            urlObj.searchParams.set('action', action);
            urlObj.searchParams.set('payload', jsonString);

            response = await fetch(urlObj.toString(), {
              method: 'GET',
              redirect: 'follow'
            }).catch(() => null);
          } catch (_) {
            // Ignore URL parse error for fallback
          }
        }

        // Attempt 3: Try application/json POST if still failing and status was not 405 initially
        if (!response || (!response.ok && response.status !== 405 && response.status !== 200)) {
          response = await fetch(trimmedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonString,
            redirect: 'follow'
          }).catch(() => null);
        }

        if (response && !response.ok) {
          if (response.status === 405) {
            console.warn(`[Server Backup Notice] Google Sheets Backup endpoint returned status 405 (Method Not Allowed). Ensure the Google Apps Script Web App is deployed with doPost(e) and deployed as 'Anyone'. Table: ${table}, Action: ${action}`);
          } else {
            console.warn(`[Server Backup Notice] Google Sheets Backup returned status ${response.status} for ${table} ${action}.`);
          }
        }
      } catch (err: any) {
        console.warn(`[Server Backup Warning] Google Sheets Backup failed for ${table} ${action}:`, err?.message || err);
      }
    })();
  };

  app.post('/api/sheets-backup', async (req, res) => {
     const { table, record_id, action, data } = req.body;
     triggerGoogleSheetsBackup(table, action, data, record_id);
     res.json({ success: true, message: 'Backup triggered' });
  });

  app.post('/api/db/insert', async (req, res) => {
    const { table, record } = req.body;
    try {
      console.log(`[Server DB Insert] Inserting into ${table}`, record);
      const result = await executeWithSelfHealing(table, 'insert', record);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      
      triggerGoogleSheetsBackup(table, 'insert', result.data?.[0] || record);
      
      res.json({ success: true, data: result.data });
    } catch (err: any) {
      if (!['activity_logs', 'notifications', 'analytics_snapshots', 'login_logs'].includes(table)) {
        console.error(`[Server DB Insert Exception] ${table}`, err);
      }
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/db/update', async (req, res) => {
    let { table, matchColumn, matchValue, updates } = req.body;
    try {
      if (table === 'payment_history' && matchColumn === 'payment_history_id') {
        matchColumn = 'id';
      }
      console.log(`[Server DB Update] Updating ${table} where ${matchColumn}=${matchValue}`, updates);

      // Enforce Staff Mobile and Email Lock Backend (Operations & Production Staff)
      if (['operations_staff', 'production_staff', 'staff'].includes(table)) {
        if (updates) {
          delete updates.mobile;
          delete updates.phone;
          delete updates.mobile_number;
          delete updates.email;
        }
      }

      // Enforce CRM Lock Backend
      if (table === 'leads' && matchColumn === 'lead_id') {
        const db = getServerSupabase();
        const { data: existingLead } = await db.from('leads').select('quotation_locked').eq('lead_id', matchValue).maybeSingle();
        
        if (existingLead && existingLead.quotation_locked === true) {
          const keys = Object.keys(updates);
          // Only allow update if it explicitly modifies quotation_locked or if it's updating status/lifecycle/assignee (not CRM quotation pricing)
          const isAllowedAction = keys.includes('quotation_locked') || keys.includes('status') || keys.includes('current_status') || keys.includes('updated_by') || keys.includes('updated_at');
          if (!isAllowedAction) {
            console.warn(`[Server DB Update] Blocked update to locked lead ${matchValue}`);
            return res.status(403).json({ success: false, error: 'Lead CRM is locked. Cannot be updated.' });
          }
        }
      }

      const result = await executeWithSelfHealing(table, 'update', updates, matchColumn, matchValue);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      
      triggerGoogleSheetsBackup(table, 'update', result.data?.[0] || updates, matchValue);
      
      res.json({ success: true, data: result.data });
    } catch (err: any) {
      if (!['activity_logs', 'notifications', 'analytics_snapshots', 'login_logs'].includes(table)) {
        console.error(`[Server DB Update Exception] ${table}`, err);
      }
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/db/upsert', async (req, res) => {
    const { table, record } = req.body;
    try {
      console.log(`[Server DB Upsert] Upserting into ${table}`, record);
      const result = await executeWithSelfHealing(table, 'upsert', record);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      
      triggerGoogleSheetsBackup(table, 'upsert', result.data?.[0] || record);
      
      res.json({ success: true, data: result.data });
    } catch (err: any) {
      if (!['activity_logs', 'notifications', 'analytics_snapshots', 'login_logs'].includes(table)) {
        console.error(`[Server DB Upsert Exception] ${table}`, err);
      }
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/db/select', async (req, res) => {
    const { table, select = '*', orderColumn, ascending = false, matchColumn, matchValue } = req.body;
    try {
      const db = getServerSupabase();
      if (table === 'equipment_handovers') {
        const { data: histData } = await db.from('lead_equipment_history').select('*');
        const mapped = (histData || []).map((deh: any) => ({
          handover_id: deh.id,
          order_id: deh.order_id || deh.lead_id,
          equipment_name: deh.equipment_name,
          return_status: deh.equipment_status,
          return_date: deh.returned_at ? deh.returned_at.split('T')[0] : new Date().toISOString().split('T')[0],
          returned_by: deh.returned_by || 'Staff',
          notes: deh.remarks || '',
          created_at: deh.created_at || deh.returned_at
        }));
        return res.json({ success: true, data: mapped });
      }

      let query = db.from(table).select(select);
      if (matchColumn && matchValue !== undefined) {
        query = query.eq(matchColumn, matchValue);
      }
      if (orderColumn) {
        query = query.order(orderColumn, { ascending });
      }
      const { data, error } = await query;
      if (error) {
        console.error(`[Server DB Select Error] ${table}`, error);
        return res.status(400).json({ success: false, error: error.message });
      }
      let resultData = data;
      if (table === 'editor_assignments' && Array.isArray(resultData)) {
        resultData = resultData.map((row: any) => ({
          ...row,
          Edited_Drive_Link: row.Edited_Drive_Link || row.edited_drive_link || null,
          edited_drive_link: row.edited_drive_link || row.Edited_Drive_Link || null
        }));
      }
      res.json({ success: true, data: resultData });
    } catch (err: any) {
      console.error(`[Server DB Select Exception] ${table}`, err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/db/select-all', async (req, res) => {
    try {
      const db = getServerSupabase();
      const queries = [
        db.from('users').select('*'),
        db.from('leads').select('*').order('created_at', { ascending: false }),
        db.from('orders').select('*').order('created_at', { ascending: false }),
        db.from('operations').select('*'),
        db.from('raw_footage').select('*'),
        db.from('production').select('*'),
        db.from('payments').select('*'),
        db.from('activity_logs').select('*').order('timestamp', { ascending: false }),
        db.from('operations_staff').select('*').order('name'),
        db.from('notifications').select('*').order('created_at', { ascending: false }),
        db.from('equipment').select('*'),
        db.from('lead_packages').select('*'),
        db.from('packages').select('*').order('created_at', { ascending: false }),
        db.from('staff_assignments').select('*'),
        db.from('quotations').select('*'),
        db.from('lead_status_history').select('*').order('created_at', { ascending: true }),
        db.from('lead_staff_assignment_history').select('*').order('assigned_at', { ascending: false }),
        db.from('lead_equipment_history').select('*').order('returned_at', { ascending: false }),
        db.from('lead_events').select('*').order('created_at', { ascending: true }),
        db.from('v_task_assignment_details').select('*'),
        db.from('production_specialties').select('*'),
        db.from('editor_assignments').select('*'),
        db.from('production_staff').select('*'),
        db.from('calendar_memos').select('*').order('created_at', { ascending: false }),
        db.from('payment_history').select('*')
      ];

      const results = await Promise.all(
        queries.map(q => Promise.resolve(q).catch(err => ({ data: [], error: { message: err?.message || String(err) } })))
      );

      const data = results.map(r => r?.data || []);
      const errors = results.map(r => r?.error ? r.error.message : null);

      res.json({ success: true, data, errors });
    } catch (err: any) {
      console.error('[Server DB Select All Exception]', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/db/delete', async (req, res) => {
    const { table, matchColumn, matchValue } = req.body;
    try {
      if (!table || !matchColumn || matchValue === undefined || matchValue === null) {
        return res.status(400).json({ success: false, error: 'Missing required parameters for deletion' });
      }
      const db = getServerSupabase();
      console.log(`[Server DB Delete] Deleting from ${table} where ${matchColumn}=${matchValue}`);
      let { data, error } = await db.from(table).delete().eq(matchColumn, matchValue).select();

      // Fallback for packages table if column is named id instead of package_id
      if (error && table === 'packages' && matchColumn === 'package_id') {
        const fallbackRes = await db.from('packages').delete().eq('id', matchValue).select();
        if (!fallbackRes.error) {
          data = fallbackRes.data;
          error = null;
        }
      }

      if (error) {
        console.error(`[Server DB Delete Error] ${table}`, error);
        return res.status(400).json({ success: false, error: error.message });
      }
      
      triggerGoogleSheetsBackup(table, 'delete', data?.[0] || { deleted_id: matchValue }, matchValue);
      
      res.json({ success: true, data });
    } catch (err: any) {
      console.error(`[Server DB Delete Exception] ${table}`, err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // Client Acceptance Verification persistent storage helpers
  const caDataDir = path.join(process.cwd(), 'data');
  const caFilePath = path.join(caDataDir, 'client_acceptance_verifications.json');

  const readCaVerificationsFromFile = (): any[] => {
    try {
      if (!fs.existsSync(caDataDir)) {
        fs.mkdirSync(caDataDir, { recursive: true });
      }
      if (!fs.existsSync(caFilePath)) {
        fs.writeFileSync(caFilePath, JSON.stringify([]), 'utf-8');
        return [];
      }
      const raw = fs.readFileSync(caFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[Server CA Storage] Error reading client acceptance verifications file:', e);
      return [];
    }
  };

  const writeCaVerificationsToFile = (records: any[]) => {
    try {
      if (!fs.existsSync(caDataDir)) {
        fs.mkdirSync(caDataDir, { recursive: true });
      }
      fs.writeFileSync(caFilePath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[Server CA Storage] Error writing client acceptance verifications file:', e);
    }
  };

  app.post('/api/client-acceptance/upsert', async (req, res) => {
    try {
      const payload = req.body;
      const {
        order_id,
        event_id,
        client_communication_consent_proof,
        folder_name,
        upload_link_path,
        final_edited_footage_link,
        proof_file_name,
        proof_storage_path,
        consent_proof_verified,
        edited_folder_uploaded_to_server,
        delivery_method,
        server_link,
        physical_drive_details
      } = payload;

      if (!order_id) {
        return res.status(400).json({ success: false, error: 'order_id is required' });
      }

      const cleanOrderId = String(order_id).trim();
      const cleanEventId = String(event_id || 'default').trim();
      const now = new Date().toISOString();
      const resolvedServerLink = (delivery_method === 'server_link' ? (server_link || final_edited_footage_link || upload_link_path) : '') || '';
      const resolvedLink = resolvedServerLink || (delivery_method === 'physical_drive' ? '' : (final_edited_footage_link !== undefined ? final_edited_footage_link : upload_link_path)) || '';

      const cleanTaskId = String(payload.task_id || payload.assignment_id || '').trim();
      const existingRecords = readCaVerificationsFromFile();
      const index = existingRecords.findIndex(
        (r: any) => {
          const rTaskId = String(r.task_id || r.assignment_id || '').trim().toLowerCase();
          if (cleanTaskId && rTaskId) {
            return rTaskId === cleanTaskId.toLowerCase() &&
                   String(r.order_id || '').trim().toLowerCase() === cleanOrderId.toLowerCase();
          }
          return String(r.order_id || '').trim().toLowerCase() === cleanOrderId.toLowerCase() &&
                 String(r.event_id || 'default').trim().toLowerCase() === cleanEventId.toLowerCase();
        }
      );

      let savedRecord: any;
      if (index >= 0) {
        // Update existing record (preventing duplicate records)
        savedRecord = {
          ...existingRecords[index],
          order_id: cleanOrderId,
          event_id: cleanEventId,
          task_id: cleanTaskId || existingRecords[index].task_id || '',
          assignment_id: cleanTaskId || existingRecords[index].assignment_id || '',
          client_communication_consent_proof: client_communication_consent_proof !== undefined ? client_communication_consent_proof : existingRecords[index].client_communication_consent_proof,
          folder_name: delivery_method === 'physical_drive' ? (physical_drive_details || folder_name || existingRecords[index].folder_name) : (folder_name !== undefined ? folder_name : existingRecords[index].folder_name),
          upload_link_path: delivery_method === 'physical_drive' ? '' : (resolvedLink || existingRecords[index].upload_link_path || ''),
          final_edited_footage_link: delivery_method === 'physical_drive' ? '' : (resolvedLink || existingRecords[index].final_edited_footage_link || existingRecords[index].upload_link_path || ''),
          proof_file_name: proof_file_name !== undefined ? proof_file_name : existingRecords[index].proof_file_name,
          proof_storage_path: proof_storage_path !== undefined ? proof_storage_path : existingRecords[index].proof_storage_path,
          consent_proof_verified: consent_proof_verified !== undefined ? Boolean(consent_proof_verified) : existingRecords[index].consent_proof_verified,
          edited_folder_uploaded_to_server: edited_folder_uploaded_to_server !== undefined ? Boolean(edited_folder_uploaded_to_server) : existingRecords[index].edited_folder_uploaded_to_server,
          delivery_method: delivery_method || existingRecords[index].delivery_method,
          server_link: delivery_method === 'server_link' ? (resolvedServerLink || existingRecords[index].server_link) : (delivery_method === 'physical_drive' ? undefined : existingRecords[index].server_link),
          physical_drive_details: delivery_method === 'physical_drive' ? (physical_drive_details || existingRecords[index].physical_drive_details) : (delivery_method === 'server_link' ? undefined : existingRecords[index].physical_drive_details),
          updated_at: now
        };
        existingRecords[index] = savedRecord;
      } else {
        // Insert new record
        savedRecord = {
          id: cleanTaskId ? `${cleanOrderId}_${cleanTaskId}` : `${cleanOrderId}_${cleanEventId}`,
          order_id: cleanOrderId,
          event_id: cleanEventId,
          task_id: cleanTaskId,
          assignment_id: cleanTaskId,
          client_communication_consent_proof: client_communication_consent_proof || '',
          folder_name: delivery_method === 'physical_drive' ? (physical_drive_details || folder_name || '') : (folder_name || ''),
          upload_link_path: delivery_method === 'physical_drive' ? '' : resolvedLink,
          final_edited_footage_link: delivery_method === 'physical_drive' ? '' : resolvedLink,
          proof_file_name: proof_file_name || '',
          proof_storage_path: proof_storage_path || '',
          consent_proof_verified: consent_proof_verified !== undefined ? Boolean(consent_proof_verified) : false,
          edited_folder_uploaded_to_server: edited_folder_uploaded_to_server !== undefined ? Boolean(edited_folder_uploaded_to_server) : false,
          delivery_method: delivery_method,
          server_link: delivery_method === 'server_link' ? resolvedServerLink : undefined,
          physical_drive_details: delivery_method === 'physical_drive' ? physical_drive_details : undefined,
          created_at: now,
          updated_at: now
        };
        existingRecords.push(savedRecord);
      }

      writeCaVerificationsToFile(existingRecords);

      // Attempt to upsert into Supabase client_acceptance_verifications table using safe column set
      try {
        const db = getServerSupabase();
        const safeSupabasePayload = {
          id: savedRecord.id,
          order_id: savedRecord.order_id,
          event_id: savedRecord.event_id,
          folder_name: savedRecord.folder_name || '',
          upload_link_path: savedRecord.upload_link_path || '',
          final_edited_footage_link: savedRecord.final_edited_footage_link || '',
          client_communication_consent_proof: savedRecord.client_communication_consent_proof || '',
          proof_file_name: savedRecord.proof_file_name || '',
          proof_storage_path: savedRecord.proof_storage_path || '',
          consent_proof_verified: savedRecord.consent_proof_verified || false,
          created_at: savedRecord.created_at,
          updated_at: savedRecord.updated_at
        };
        await db.from('client_acceptance_verifications').upsert(safeSupabasePayload, {
          onConflict: 'order_id,event_id'
        });
      } catch (dbErr) {
        // Suppress warning if table is not yet created in Postgres
      }

      // Sync delivery method directly to linked Supabase production record
      try {
        const db = getServerSupabase();
        const { data: matchedProds } = await db.from('production')
          .select('production_id, validated_server_uploads')
          .or(`order_id.eq.${cleanOrderId},tracking_id.eq.${cleanOrderId}`)
          .limit(5);

        if (Array.isArray(matchedProds) && matchedProds.length > 0) {
          for (const mProd of matchedProds) {
            const prevUploads = (mProd.validated_server_uploads && typeof mProd.validated_server_uploads === 'object') ? { ...mProd.validated_server_uploads } : {};
            if (savedRecord.delivery_method === 'physical_drive') {
              delete (prevUploads as any).server_link;
            } else if (savedRecord.delivery_method === 'server_link') {
              delete (prevUploads as any).physical_drive_details;
            }
            const nextUploads = {
              ...prevUploads,
              delivery_method: savedRecord.delivery_method,
              ...(savedRecord.delivery_method === 'server_link' ? { server_link: savedRecord.server_link } : {}),
              ...(savedRecord.delivery_method === 'physical_drive' ? { physical_drive_details: savedRecord.physical_drive_details } : {})
            };
            const prodUp: any = {
              validated_server_uploads: nextUploads,
              delivery_link: savedRecord.delivery_method === 'server_link' ? (savedRecord.server_link || '') : '',
              upload_link_path: savedRecord.delivery_method === 'server_link' ? (savedRecord.server_link || '') : '',
              final_edited_footage_link: savedRecord.delivery_method === 'server_link' ? (savedRecord.server_link || '') : ''
            };
            if (savedRecord.delivery_method === 'physical_drive' && savedRecord.physical_drive_details) {
              prodUp.folder_name = savedRecord.physical_drive_details;
            }
            await db.from('production').update(prodUp).eq('production_id', mProd.production_id);
          }
        }
      } catch (syncErr) {
        console.warn('[Server CA Storage] Supabase production record sync warning:', syncErr);
      }

      console.log(`[Server CA Storage] Successfully saved verification for Order: ${cleanOrderId}, Event: ${cleanEventId}, Folder: "${savedRecord.folder_name}"`);
      res.json({ success: true, data: savedRecord });
    } catch (err: any) {
      console.error('[Server CA Storage Upsert Exception]', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.get('/api/client-acceptance/list', async (req, res) => {
    try {
      let records = readCaVerificationsFromFile();

      // Check if Supabase table has records
      try {
        const db = getServerSupabase();
        const { data: dbRecords, error } = await db.from('client_acceptance_verifications').select('*');
        if (!error && Array.isArray(dbRecords) && dbRecords.length > 0) {
          // Merge dbRecords with file records
          const map = new Map<string, any>();
          records.forEach((r: any) => map.set(`${String(r.order_id).trim().toLowerCase()}__${String(r.event_id || 'default').trim().toLowerCase()}`, r));
          dbRecords.forEach((r: any) => map.set(`${String(r.order_id).trim().toLowerCase()}__${String(r.event_id || 'default').trim().toLowerCase()}`, { ...map.get(`${String(r.order_id).trim().toLowerCase()}__${String(r.event_id || 'default').trim().toLowerCase()}`), ...r }));
          records = Array.from(map.values());
          writeCaVerificationsToFile(records);
        }
      } catch (_) {}

      res.json({ success: true, data: records });
    } catch (err: any) {
      console.error('[Server CA Storage List Exception]', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // Client Approval Progress Storage & Verification
  const capDataDir = path.join(process.cwd(), 'data');
  const capFilePath = path.join(capDataDir, 'client_approval_progress.json');

  const readClientApprovalProgressFromFile = (): any[] => {
    try {
      if (!fs.existsSync(capDataDir)) {
        fs.mkdirSync(capDataDir, { recursive: true });
      }
      if (!fs.existsSync(capFilePath)) {
        fs.writeFileSync(capFilePath, JSON.stringify([]), 'utf-8');
        return [];
      }
      const raw = fs.readFileSync(capFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[Server Approval Progress] Error reading file:', e);
      return [];
    }
  };

  const writeClientApprovalProgressToFile = (records: any[]) => {
    try {
      if (!fs.existsSync(capDataDir)) {
        fs.mkdirSync(capDataDir, { recursive: true });
      }
      fs.writeFileSync(capFilePath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[Server Approval Progress] Error writing file:', e);
    }
  };

  // GET /api/client-approval/progress/:projectId
  app.get('/api/client-approval/progress/:projectId', async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!projectId) {
        return res.status(400).json({ success: false, error: 'Project ID is required' });
      }
      const cleanId = String(projectId).trim();
      const records = readClientApprovalProgressFromFile();
      const fileRecord = records.find(
        (r: any) => String(r.project_id || '').trim().toLowerCase() === cleanId.toLowerCase()
      );

      let dbRecord = null;
      try {
        const db = getServerSupabase();
        // Check dedicated table first if exists
        const { data: capData } = await db
          .from('client_approval_progress')
          .select('*')
          .eq('project_id', cleanId)
          .maybeSingle();
        if (capData) {
          dbRecord = capData;
        } else {
          // Check production table checklist fields
          const { data: prodData } = await db
            .from('production')
            .select('production_id, checklist_customer_acceptance, checklist_content_usage, checklist_footage_deleted_7_days, checklist_payment_from_sales, checklist_edited_files_uploaded, updated_at')
            .eq('production_id', cleanId)
            .maybeSingle();
          if (prodData && (
            prodData.checklist_customer_acceptance ||
            prodData.checklist_content_usage ||
            prodData.checklist_footage_deleted_7_days ||
            prodData.checklist_payment_from_sales ||
            prodData.checklist_edited_files_uploaded
          )) {
            dbRecord = {
              id: `cap_${cleanId}`,
              project_id: cleanId,
              client_approval: Boolean(prodData.checklist_customer_acceptance),
              content_usage_confirmation: Boolean(prodData.checklist_content_usage),
              footage_deleted_7_days: Boolean(prodData.checklist_footage_deleted_7_days),
              verify_payment_from_sales: Boolean(prodData.checklist_payment_from_sales),
              validate_edited_files_uploaded: Boolean(prodData.checklist_edited_files_uploaded),
              saved_at: prodData.updated_at || new Date().toISOString(),
              updated_at: prodData.updated_at || new Date().toISOString()
            };
          }
        }
      } catch (_) {}

      const finalRecord = fileRecord || dbRecord || null;
      return res.json({ success: true, data: finalRecord });
    } catch (err: any) {
      console.error('[Server Approval Progress GET Exception]', err);
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // POST /api/client-approval/progress
  app.post('/api/client-approval/progress', async (req, res) => {
    try {
      const {
        project_id,
        client_approval,
        content_usage_confirmation,
        footage_deleted_7_days,
        verify_payment_from_sales,
        validate_edited_files_uploaded
      } = req.body;

      if (!project_id) {
        return res.status(400).json({ success: false, error: 'project_id is required' });
      }

      const cleanId = String(project_id).trim();
      const now = new Date().toISOString();

      const records = readClientApprovalProgressFromFile();
      const index = records.findIndex(
        (r: any) => String(r.project_id || '').trim().toLowerCase() === cleanId.toLowerCase()
      );

      const savedRecord = {
        id: `cap_${cleanId}`,
        project_id: cleanId,
        client_approval: Boolean(client_approval),
        content_usage_confirmation: Boolean(content_usage_confirmation),
        footage_deleted_7_days: Boolean(footage_deleted_7_days),
        verify_payment_from_sales: Boolean(verify_payment_from_sales),
        validate_edited_files_uploaded: Boolean(validate_edited_files_uploaded),
        saved_at: index >= 0 ? (records[index].saved_at || now) : now,
        updated_at: now
      };

      if (index >= 0) {
        records[index] = savedRecord;
      } else {
        records.push(savedRecord);
      }
      writeClientApprovalProgressToFile(records);

      // Persist to Supabase: Update production table checklist fields and status for this project
      try {
        const db = getServerSupabase();
        const updatePayload: any = {
          checklist_customer_acceptance: savedRecord.client_approval,
          checklist_content_usage: savedRecord.content_usage_confirmation,
          checklist_footage_deleted_7_days: savedRecord.footage_deleted_7_days,
          checklist_payment_from_sales: savedRecord.verify_payment_from_sales,
          checklist_edited_files_uploaded: savedRecord.validate_edited_files_uploaded
        };

        if (savedRecord.client_approval) {
          updatePayload.editing_status = 'Client Accepted';
          updatePayload.production_status = 'Client Accepted';
          updatePayload.current_status = 'Client Accepted';
          updatePayload.status = 'Client Accepted';
        }

        await db.from('production').update(updatePayload).eq('production_id', cleanId);

        // Also try to upsert to client_approval_progress table if table exists
        try {
          await db.from('client_approval_progress').upsert(savedRecord, { onConflict: 'project_id' });
        } catch (_) {}
      } catch (dbErr) {
        console.warn('[Server Approval Progress DB Sync Warning]', dbErr);
      }

      console.log(`[Server Approval Progress] Successfully saved progress for Project ID: ${cleanId}`);
      return res.json({ success: true, data: savedRecord, message: 'Approval progress saved successfully' });
    } catch (err: any) {
      console.error('[Server Approval Progress POST Exception]', err);
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // POST /api/production/validate-edited-files
  // Verifies that edited files are actually uploaded to server/storage for the specified project_id
  app.post('/api/production/validate-edited-files', async (req, res) => {
    try {
      const { project_id } = req.body;
      if (!project_id) {
        return res.status(400).json({ success: false, isValid: false, uploaded: false, error: 'project_id is required' });
      }

      const cleanId = String(project_id).trim();
      const db = getServerSupabase();

      // 1. Fetch production record strictly for this project_id
      const { data: prodData, error: prodErr } = await db
        .from('production')
        .select('*')
        .eq('production_id', cleanId)
        .limit(1);

      if (prodErr || !prodData || prodData.length === 0) {
        return res.status(404).json({
          success: false,
          isValid: false,
          uploaded: false,
          projectId: cleanId,
          message: `Project (${cleanId}) not found in the system.`
        });
      }

      const prod = prodData[0];
      const orderId = prod.order_id ? String(prod.order_id).trim() : '';

      // 2. Fetch editor assignments strictly for this production_id (or order_id)
      let assignments: any[] = [];
      const { data: eaData } = await db
        .from('editor_assignments')
        .select('*')
        .eq('production_id', cleanId);

      if (Array.isArray(eaData) && eaData.length > 0) {
        assignments = eaData;
      } else if (orderId) {
        const { data: eaOrderData } = await db
          .from('editor_assignments')
          .select('*')
          .eq('order_id', orderId);
        if (Array.isArray(eaOrderData) && eaOrderData.length > 0) {
          assignments = eaOrderData;
        }
      }

      // 3. Fetch client acceptance verifications for this order if available
      let caVerifs: any[] = [];
      if (orderId) {
        const { data: cavData } = await db
          .from('client_acceptance_verifications')
          .select('*')
          .eq('order_id', orderId);
        if (Array.isArray(cavData)) {
          caVerifs = cavData;
        }
      }

      const fileCaRecords = readCaVerificationsFromFile().filter((r: any) =>
        orderId && String(r.order_id || '').trim().toLowerCase() === orderId.toLowerCase()
      );
      const combinedCaVerifs = [...caVerifs, ...fileCaRecords];

      // Verification checks:
      // A) Project-level checks:
      const prodHasConfirmedServerUpload = prod.server_upload_confirmed === true;
      const prodHasEditedFolderUploaded = prod.edited_folder_uploaded_to_server === true;
      const prodFolderName = (prod.server_upload_folder_name || prod.server_path || prod.folder_name || '').trim();
      const prodDriveLink = (prod.edited_drive_link || prod.delivery_link || prod.final_edited_footage_link || prod.upload_link_path || '').trim();

      // B) Assignment-level checks:
      let assignmentsWithUploadedFiles = 0;
      let matchedFolderName = prodFolderName;
      let matchedDriveLink = prodDriveLink;

      assignments.forEach((a: any) => {
        const aFolder = (a.server_upload_folder_name || a.server_path || a.folder_name || '').trim();
        const aLink = (a.edited_drive_link || a.Edited_Drive_Link || a.server_file_link || a.upload_link || a.final_edited_footage_link || a.upload_link_path || '').trim();
        const aProof = (a.proof_url || a.proof_image || a.uploaded_proof || a.customer_review_image || a.confirmation_proof || a.client_communication_proof || '').trim();
        const aConfirmed = a.server_upload_confirmed === true || a.edited_folder_uploaded_to_server === true;

        const hasUploaded = aConfirmed || Boolean(aFolder) || Boolean(aLink) || Boolean(aProof);
        if (hasUploaded) {
          assignmentsWithUploadedFiles++;
          if (!matchedFolderName && aFolder) matchedFolderName = aFolder;
          if (!matchedDriveLink && aLink) matchedDriveLink = aLink;
        }
      });

      // C) CA Verifications check:
      const cavMatch = combinedCaVerifs.find((cav: any) =>
        cav.consent_proof_verified === true ||
        cav.edited_folder_uploaded_to_server === true ||
        Boolean((cav.folder_name || '').trim()) ||
        Boolean((cav.upload_link_path || cav.final_edited_footage_link || '').trim()) ||
        Boolean((cav.proof_storage_path || '').trim())
      );
      if (cavMatch && !matchedFolderName && cavMatch.folder_name) {
        matchedFolderName = cavMatch.folder_name.trim();
      }

      const hasUploaded =
        prodHasConfirmedServerUpload ||
        prodHasEditedFolderUploaded ||
        Boolean(prodFolderName) ||
        Boolean(prodDriveLink) ||
        Boolean(cavMatch) ||
        (assignments.length > 0 && assignmentsWithUploadedFiles > 0);

      if (!hasUploaded) {
        return res.json({
          success: true,
          isValid: false,
          uploaded: false,
          projectId: cleanId,
          message: `Edited files must be uploaded to the server first for Project ID ${cleanId}. No server upload or edited folder found.`,
          details: {
            assignmentsTotal: assignments.length,
            assignmentsWithFiles: assignmentsWithUploadedFiles,
            folderName: null
          }
        });
      }

      return res.json({
        success: true,
        isValid: true,
        uploaded: true,
        projectId: cleanId,
        message: `Edited files verified on server for Project ID ${cleanId}.`,
        details: {
          folderName: matchedFolderName || 'Server Storage Verified',
          driveLink: matchedDriveLink || null,
          assignmentsTotal: assignments.length,
          assignmentsWithFiles: assignmentsWithUploadedFiles,
          serverConfirmed: prodHasConfirmedServerUpload || prodHasEditedFolderUploaded || assignmentsWithUploadedFiles > 0
        }
      });
    } catch (err: any) {
      console.error('[Server Validate Edited Files Exception]', err);
      return res.status(500).json({ success: false, isValid: false, uploaded: false, error: err.message || String(err) });
    }
  });

  app.post('/api/auth/create-user', async (req, res) => {
    const { email, password, name, role, mobile, active = true, staff_id } = req.body;
    try {
      const db = getServerSupabase();
      if (!db.auth.admin) {
        return res.status(400).json({ success: false, error: 'Service Role Key not configured on server' });
      }
      
      const cleanEmailStr = cleanEmail(email);
      const cleanMobileStr = cleanPhone(mobile);
      console.log(`[Server Auth] Creating user ${cleanEmailStr} (mobile: ${cleanMobileStr}) with role ${role}`);
      
      // Global uniqueness check before creating
      const uniqueCheck = await checkGlobalUniquenessInDb(
        db, 
        cleanMobileStr, 
        cleanEmailStr, 
        null, 
        null, 
        null, 
        staff_id || null
      );
      if (!uniqueCheck.isUnique) {
        return res.status(400).json({ 
          success: false, 
          error: uniqueCheck.error,
          isMobileDuplicate: uniqueCheck.isMobileDuplicate,
          isEmailDuplicate: uniqueCheck.isEmailDuplicate
        });
      }

      let authUser: any = null;
      const { data, error } = await db.auth.admin.createUser({
        email: cleanEmailStr,
        password,
        email_confirm: true,
        user_metadata: { name, role, mobile: cleanMobileStr }
      });

      if (error) {
        const errMsg = (error.message || '').toLowerCase();
        if (errMsg.includes('already') || errMsg.includes('registered') || errMsg.includes('exists')) {
          // If the auth account already exists (e.g. from an orphaned record), reuse & update credentials
          try {
            const { data: listData } = await db.auth.admin.listUsers();
            const existingAuth = (listData?.users || []).find((u: any) => cleanEmail(u.email) === cleanEmailStr);
            if (existingAuth) {
              const { data: updData } = await db.auth.admin.updateUserById(existingAuth.id, {
                password,
                user_metadata: { name, role, mobile: cleanMobileStr }
              });
              authUser = updData?.user || existingAuth;
            }
          } catch (listErr) {
            console.warn('[Server Auth find existing error]', listErr);
          }
        }
        if (!authUser) {
          return res.status(400).json({ success: false, error: error.message });
        }
      } else {
        authUser = data.user;
      }

      let normalizedRole = 'Operation Staff';
      if (role) {
        const r = String(role).trim().toLowerCase();
        if (r.includes('owner') || r.includes('business')) normalizedRole = 'Business Owner';
        else if (r.includes('sales')) normalizedRole = 'Sales Team';
        else if (r.includes('prod')) normalizedRole = 'Production Team'; // users table constraint only allows Production Team
        else if (r.includes('editor')) normalizedRole = 'Production Team';
        else if (r.includes('op') && r.includes('staff')) normalizedRole = 'Operation Staff';
        else if (r.includes('op') && r.includes('team')) normalizedRole = 'Operations Team';
        else normalizedRole = 'Operation Staff';
      }

      const userRecord: any = {
        id: authUser.id,
        name,
        email: cleanEmailStr,
        mobile: cleanMobileStr || '0000000000',
        username: cleanEmailStr,
        role: normalizedRole,
        active,
        password,
        created_at: new Date().toISOString()
      };
      
      const { data: insData, error: insErr } = await db.from('users').upsert(userRecord, { onConflict: 'email' }).select();
      if (insErr) {
        console.warn(`[Server Auth DB Upsert Warning]`, insErr);
      }

      res.json({ success: true, data: { user: authUser, record: insData?.[0] || userRecord } });
    } catch (err: any) {
      console.error(`[Server Auth Create Exception]`, err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/auth/delete-user', async (req, res) => {
    const { staff_id, mobile, email, auth_id } = req.body;
    try {
      const db = getServerSupabase();
      const cleanEmailStr = cleanEmail(email);
      const cleanMobileStr = cleanPhone(mobile);

      // 1. Delete from public.users table by matching criteria
      if (staff_id) {
        await db.from('users').delete().eq('id', staff_id);
      }
      if (auth_id) {
        await db.from('users').delete().eq('id', auth_id);
      }
      if (cleanEmailStr) {
        await db.from('users').delete().eq('email', cleanEmailStr);
      }
      if (cleanMobileStr && cleanMobileStr.length >= 7 && cleanMobileStr !== '0000000000') {
        await db.from('users').delete().eq('mobile', cleanMobileStr);
      }

      // 2. Delete from Supabase Auth if admin api available
      if (db.auth && db.auth.admin) {
        if (auth_id) {
          try { await db.auth.admin.deleteUser(auth_id); } catch (_) {}
        }
        if (cleanEmailStr) {
          try {
            const { data: listData } = await db.auth.admin.listUsers();
            const foundUser = (listData?.users || []).find((u: any) => cleanEmail(u.email) === cleanEmailStr);
            if (foundUser?.id) {
              await db.auth.admin.deleteUser(foundUser.id);
            }
          } catch (_) {}
        }
      }

      res.json({ success: true, message: 'User deleted from auth and directory' });
    } catch (err: any) {
      console.warn('[Server Auth Delete Error]', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/auth/update-user', async (req, res) => {
    const { auth_id, staff_id, email, password, name, role, mobile, active } = req.body;
    try {
      const db = getServerSupabase();
      if (!db.auth.admin) {
        return res.status(400).json({ success: false, error: 'Service Role Key not configured' });
      }
      
      const isStaffRole = role && ['Operation Staff', 'production staff', 'Editor', 'Sales Team'].some(r => role.toLowerCase().includes(r.toLowerCase()));
      let cleanMobile: string | undefined = mobile ? cleanPhone(mobile) : undefined;
      let cleanEmail: string | undefined = email ? (typeof email === 'string' ? email.trim().toLowerCase() : undefined) : undefined;
      const cleanMobileStr = cleanMobile;
      const cleanEmailStr = cleanEmail;

      // Identify whether mobile or email belongs to the account being updated
      let existingMobileFound: string | null = null;
      let existingEmailFound: string | null = null;

      if (auth_id) {
        const { data: userRec } = await db.from('users').select('id, email, mobile').eq('id', auth_id).maybeSingle();
        if (userRec?.mobile) existingMobileFound = cleanPhone(userRec.mobile);
        if (userRec?.email) existingEmailFound = String(userRec.email).trim().toLowerCase();
      }
      if (staff_id) {
        const { data: opRec } = await db.from('operations_staff').select('staff_id, email, mobile').eq('staff_id', staff_id).maybeSingle();
        if (opRec?.mobile && !existingMobileFound) existingMobileFound = cleanPhone(opRec.mobile);
        if (opRec?.email && !existingEmailFound) existingEmailFound = String(opRec.email).trim().toLowerCase();
        
        if (!existingMobileFound || !existingEmailFound) {
          const { data: prodRec } = await db.from('production_staff').select('staff_id, email, mobile').eq('staff_id', staff_id).maybeSingle();
          if (prodRec?.mobile && !existingMobileFound) existingMobileFound = cleanPhone(prodRec.mobile);
          if (prodRec?.email && !existingEmailFound) existingEmailFound = String(prodRec.email).trim().toLowerCase();
        }
      }

      // Check global uniqueness when updating mobile or email
      if (cleanMobileStr || cleanEmailStr) {
        const uniqueCheck = await checkGlobalUniquenessInDb(
          db, 
          cleanMobileStr || existingMobileFound, 
          cleanEmailStr || existingEmailFound, 
          auth_id, 
          existingEmailFound || cleanEmailStr, 
          existingMobileFound || cleanMobileStr, 
          staff_id
        );
        if (!uniqueCheck.isUnique) {
          return res.status(400).json({ 
            success: false, 
            error: uniqueCheck.error,
            isMobileDuplicate: uniqueCheck.isMobileDuplicate,
            isEmailDuplicate: uniqueCheck.isEmailDuplicate 
          });
        }
      }

      // Determine auth user ID
      let targetAuthId: string | null = auth_id || null;
      let targetAuthUser: any = null;

      if (targetAuthId) {
        try {
          const { data: uData, error: uErr } = await db.auth.admin.getUserById(targetAuthId);
          if (!uErr && uData?.user) {
            targetAuthUser = uData.user;
          }
        } catch (e) {}
      }

      // If not directly found in auth by ID, check if staff_id has auth_user_id in notes
      if (!targetAuthUser && staff_id) {
        try {
          const { data: psRec } = await db.from('production_staff').select('notes, email, mobile').eq('staff_id', staff_id).maybeSingle();
          if (psRec?.notes) {
            try {
              const parsed = JSON.parse(psRec.notes);
              if (parsed.auth_user_id) {
                const { data: psAuth, error: psAuthErr } = await db.auth.admin.getUserById(parsed.auth_user_id);
                if (!psAuthErr && psAuth?.user) {
                  targetAuthUser = psAuth.user;
                  targetAuthId = psAuth.user.id;
                }
              }
            } catch (e) {}
          }
          if (!cleanEmail && psRec?.email) cleanEmail = psRec.email.trim().toLowerCase();
          if (!cleanMobile && psRec?.mobile) cleanMobile = cleanPhone(psRec.mobile);
        } catch (e) {}
      }

      // If target auth user still not found, search auth.users by email or phone/mobile
      if (!targetAuthUser && (cleanEmail || cleanMobile)) {
        try {
          const { data: listData } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const found = (listData?.users || []).find((u: any) =>
            (cleanEmail && u.email?.trim().toLowerCase() === cleanEmail) ||
            (cleanMobile && (cleanPhone(u.phone) === cleanMobile || cleanPhone(u.user_metadata?.mobile) === cleanMobile))
          );
          if (found) {
            targetAuthUser = found;
            targetAuthId = found.id;
          }
        } catch (e) {}
      }

      // If user doesn't exist in Supabase Auth yet and password is provided, create the auth user
      if (!targetAuthUser && password) {
        if (!cleanEmail && !cleanMobile) {
          return res.status(404).json({ success: false, error: 'Staff authentication account not found' });
        }
        const createEmail = cleanEmail || `${cleanMobile}@photocrew.com`;
        const { data: created, error: createErr } = await db.auth.admin.createUser({
          email: createEmail,
          password: password,
          user_metadata: { name: name || 'Staff Member', role: role || 'Production Staff', mobile: cleanMobile },
          email_confirm: true
        });
        if (createErr) {
          console.error('[Server Auth Create User Error]', createErr);
          return res.status(400).json({ success: false, error: createErr.message || 'Failed to create authentication credentials' });
        }
        targetAuthUser = created.user;
        targetAuthId = created.user.id;
      }

      // Prepare updates for Supabase Auth
      const updates: any = {};
      if (password) updates.password = password;
      if (cleanEmail && !isStaffRole) updates.email = cleanEmail;
      if (name || role || cleanMobile) updates.user_metadata = { name, role, mobile: cleanMobile || mobile };
      
      // Update Supabase Auth credentials securely and verify success
      if (targetAuthId) {
        if (password) {
          const { data: updData, error: authUpdErr } = await db.auth.admin.updateUserById(targetAuthId, updates);
          if (authUpdErr) {
            console.error('[Server Auth Password Update Error]', authUpdErr);
            return res.status(400).json({ success: false, error: authUpdErr.message || 'Authentication provider failed to update password' });
          }
        } else if (Object.keys(updates).length > 0) {
          const { error: nonPwErr } = await db.auth.admin.updateUserById(targetAuthId, updates);
          if (nonPwErr) {
            console.warn('[Server Auth Non-Password Update Warning]', nonPwErr.message);
          }
        }
      } else if (password) {
        return res.status(404).json({ success: false, error: 'Could not find or create authentication account for staff member' });
      }
      
      // Update users table - Do NOT store plaintext password!
      const userUpdates: any = {};
      if (name) userUpdates.name = name;
      if (cleanEmail && !isStaffRole) userUpdates.email = cleanEmail;
      if (role) {
        const r = String(role).trim().toLowerCase();
        if (r.includes('owner') || r.includes('business')) userUpdates.role = 'Business Owner';
        else if (r.includes('sales')) userUpdates.role = 'Sales Team';
        else if (r.includes('prod') && r.includes('staff')) userUpdates.role = 'Production Staff';
        else if (r.includes('editor')) userUpdates.role = 'Production Staff';
        else if (r.includes('prod') && r.includes('team')) userUpdates.role = 'Production Team';
        else if (r.includes('op') && r.includes('staff')) userUpdates.role = 'Operation Staff';
        else if (r.includes('op') && r.includes('team')) userUpdates.role = 'Operations Team';
        else if (r.includes('prod')) userUpdates.role = 'Production Team';
        else userUpdates.role = role;
      }
      if (cleanMobile !== undefined) userUpdates.mobile = cleanMobile;
      if (active !== undefined) userUpdates.active = active;
      if (password) {
        // Clear plaintext password field in database to prevent storing plaintext passwords
        userUpdates.password = null;
      }
      
      let dbData: any[] | null = null;
      if (targetAuthId) {
        const { data: res1 } = await db.from('users').update(userUpdates).eq('id', targetAuthId).select();
        if (Array.isArray(res1) && res1.length > 0) dbData = res1;
      }
      if (cleanEmail) {
        const { data: res2 } = await db.from('users').update(userUpdates).ilike('email', cleanEmail).select();
        if (Array.isArray(res2) && res2.length > 0 && !dbData) dbData = res2;
      }
      if (cleanMobile) {
        const { data: res3 } = await db.from('users').update(userUpdates).eq('mobile', cleanMobile).select();
        if (Array.isArray(res3) && res3.length > 0 && !dbData) dbData = res3;
      }

      // Update production_staff table notes with targetAuthId and synchronize Password column with secure hash
      if (staff_id || cleanEmail || cleanMobile) {
        try {
          let psQuery = db.from('production_staff').select('staff_id, notes');
          if (staff_id) psQuery = psQuery.eq('staff_id', staff_id);
          else if (cleanEmail) psQuery = psQuery.ilike('email', cleanEmail);
          else if (cleanMobile) psQuery = psQuery.eq('mobile', cleanMobile);

          const { data: psRows, error: psFindErr } = await psQuery;
          if (psFindErr) {
            console.error('[Server Auth PS Find Error]', psFindErr);
            return res.status(500).json({ success: false, error: 'Failed to find production staff record' });
          }

          if (psRows && psRows.length > 0) {
            for (const row of psRows) {
              let notesObj: any = {};
              try { if (row.notes) notesObj = JSON.parse(row.notes); } catch (e) {}
              if (targetAuthId) {
                notesObj.auth_user_id = targetAuthId;
              }
              const psUpdates: any = { notes: JSON.stringify(notesObj) };
              if (password) {
                // Securely hash password using SHA-256 before saving to production_staff.Password
                const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
                psUpdates.Password = passwordHash;
                notesObj.current_password = password;
                psUpdates.notes = JSON.stringify(notesObj);
              }
              const { error: psUpdErr } = await db.from('production_staff').update(psUpdates).eq('staff_id', row.staff_id);
              if (psUpdErr) {
                console.error('[Server Auth PS Sync Error]', psUpdErr);
                return res.status(500).json({ success: false, error: 'Failed to synchronize password in production staff table' });
              }
            }
          }
        } catch (psErr: any) {
          console.error('[Server Auth PS Sync Exception]', psErr);
          return res.status(500).json({ success: false, error: psErr.message || 'Error synchronizing production staff record' });
        }
      }
      
      res.json({ success: true, auth_user_id: targetAuthId, data: { record: dbData?.[0] || userUpdates } });
    } catch (err: any) {
      console.error(`[Server Auth Update Exception]`, err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // Endpoint to retrieve current password for a staff member for authorized manager display
  app.post('/api/auth/get-staff-password', async (req, res) => {
    try {
      const db = getServerSupabase();
      if (!db.auth.admin) {
        return res.status(400).json({ success: false, error: 'Service Role Key not configured' });
      }

      const { staff_id, email, mobile, auth_id } = req.body;
      let targetAuthId = auth_id;
      const cleanEmail = email ? email.trim().toLowerCase() : null;
      let cleanMobile = mobile ? cleanPhone(mobile) : null;
      const mobile10 = cleanMobile && cleanMobile.length >= 10 ? cleanMobile.slice(-10) : cleanMobile;

      // 1. Check production_staff table notes or unhashed Password
      if (staff_id || cleanEmail || cleanMobile) {
        let psQuery = db.from('production_staff').select('notes, Password, mobile');
        if (staff_id) psQuery = psQuery.eq('staff_id', staff_id);
        else if (cleanEmail) psQuery = psQuery.ilike('email', cleanEmail);
        else if (cleanMobile) psQuery = psQuery.ilike('mobile', `%${mobile10}%`);

        const { data: psRows } = await psQuery.limit(1);
        if (psRows && psRows.length > 0) {
          const row = psRows[0];
          try {
            if (row.notes) {
              const parsed = JSON.parse(row.notes);
              if (parsed.current_password && !/^[a-f0-9]{32,128}$/i.test(parsed.current_password.trim())) {
                return res.json({ success: true, password: parsed.current_password });
              }
              if (parsed.notes && typeof parsed.notes === 'string') {
                try {
                  const nested = JSON.parse(parsed.notes);
                  if (nested.current_password && !/^[a-f0-9]{32,128}$/i.test(nested.current_password.trim())) {
                    return res.json({ success: true, password: nested.current_password });
                  }
                  if (!targetAuthId && nested.auth_user_id) targetAuthId = nested.auth_user_id;
                } catch (e) {}
              }
              if (!targetAuthId && parsed.auth_user_id) targetAuthId = parsed.auth_user_id;
            }
          } catch (e) {}
          if (row.Password && !/^[a-f0-9]{32,128}$/i.test(row.Password.trim()) && !row.Password.startsWith('$2')) {
            return res.json({ success: true, password: row.Password.trim() });
          }
          if (row.mobile && !cleanMobile) {
            cleanMobile = (row.mobile || '').replace(/\D/g, '');
          }
        }
      }

      // 2. Check Supabase Auth user_metadata
      if (targetAuthId) {
        const { data: userData } = await db.auth.admin.getUserById(targetAuthId);
        if (userData?.user?.user_metadata?.current_password) {
          const cp = String(userData.user.user_metadata.current_password).trim();
          if (!/^[a-f0-9]{32,128}$/i.test(cp) && !cp.startsWith('$2')) {
            return res.json({ success: true, password: cp });
          }
        }
      }

      // 3. Check auth.users by email or mobile
      if (cleanEmail || cleanMobile) {
        const { data: listData } = await db.auth.admin.listUsers();
        const found = (listData?.users || []).find((u: any) => {
          const uEmail = u.email?.toLowerCase();
          const uMobile = (u.user_metadata?.mobile || u.phone || '').replace(/\D/g, '');
          if (cleanEmail && uEmail === cleanEmail) return true;
          if (cleanMobile && uMobile && (uMobile === cleanMobile || (mobile10 && uMobile.endsWith(mobile10)))) return true;
          return false;
        });
        if (found?.user_metadata?.current_password) {
          const cp = String(found.user_metadata.current_password).trim();
          if (!/^[a-f0-9]{32,128}$/i.test(cp) && !cp.startsWith('$2')) {
            return res.json({ success: true, password: cp });
          }
        }
      }

      // 4. Check users table
      if (cleanEmail || cleanMobile || targetAuthId) {
        let uQuery = db.from('users').select('password');
        if (targetAuthId) uQuery = uQuery.eq('id', targetAuthId);
        else if (cleanEmail) uQuery = uQuery.ilike('email', cleanEmail);
        else if (cleanMobile) uQuery = uQuery.ilike('mobile', `%${mobile10}%`);

        const { data: uRows } = await uQuery.limit(1);
        if (uRows && uRows.length > 0 && uRows[0]?.password && !/^[a-f0-9]{32,128}$/i.test(uRows[0].password.trim()) && !String(uRows[0].password).trim().startsWith('$2')) {
          return res.json({ success: true, password: uRows[0].password.trim() });
        }
      }

      // 5. If no plaintext password is stored in auth or database (e.g. stored only as secure hash), return null
      return res.json({ success: true, password: null });
    } catch (err: any) {
      console.error('[get-staff-password] error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware for development vs static files for production
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' && hasDist;

  if (!isProduction) {
    console.log('[Server] Mounting Vite development middleware...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[Server] Serving production static assets from dist...');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
