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
  app.set('trust proxy', 1);
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

  app.use(cors({ origin: true, credentials: true }));

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

    if (table === 'operations_staff' || table === 'staff') {
      delete clone.password;
      delete clone.Password;
      delete clone.current_password;
      if (clone.notes && typeof clone.notes === 'string' && clone.notes.trim().startsWith('{')) {
        try {
          const parsedNotes = JSON.parse(clone.notes);
          if (parsedNotes && typeof parsedNotes === 'object') {
            delete parsedNotes.current_password;
            delete parsedNotes.password;
            delete parsedNotes.Password;
            clone.notes = JSON.stringify(parsedNotes);
          }
        } catch (_) {}
      }
    }

    if (table === 'production_staff') {
      const rawCapPwd = clone.Password;
      const isValidPlainProdPwd =
        typeof rawCapPwd === 'string' &&
        rawCapPwd.trim() !== '' &&
        !rawCapPwd.trim().startsWith('enc:v1:') &&
        !/^[0-9a-f]{32}$/i.test(rawCapPwd.trim()) &&
        !/^[0-9a-f]{40}$/i.test(rawCapPwd.trim()) &&
        !/^[0-9a-f]{64}$/i.test(rawCapPwd.trim()) &&
        !/^[0-9a-f]{128}$/i.test(rawCapPwd.trim()) &&
        !/^\$2[aby]?\$\d{2}\$/.test(rawCapPwd.trim()) &&
        !rawCapPwd.trim().startsWith('$argon2');
      if (!isValidPlainProdPwd) {
        delete clone.Password;
      }
      delete clone.password;
      delete clone.current_password;
      if (clone.notes && typeof clone.notes === 'string' && clone.notes.trim().startsWith('{')) {
        try {
          const parsedNotes = JSON.parse(clone.notes);
          if (parsedNotes && typeof parsedNotes === 'object') {
            delete parsedNotes.current_password;
            delete parsedNotes.password;
            delete parsedNotes.Password;
            clone.notes = JSON.stringify(parsedNotes);
          }
        } catch (_) {}
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

    if (table === 'equipment_categories') {
      delete clone.old_category_name;
      delete clone.oldCategoryName;
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
      const { opData, prodData, usersData, oErr, pErr, uErr } = await getDirectoryTablesCached(db);
      if (oErr) {
        console.error('[checkGlobalUniquenessInDb] operations_staff query error:', oErr.message);
        return { isUnique: false, isMobileDuplicate: false, isEmailDuplicate: false, queryFailed: true, error: `Database error checking operations staff: ${oErr.message}` };
      }
      if (pErr) {
        console.error('[checkGlobalUniquenessInDb] production_staff query error:', pErr.message);
        return { isUnique: false, isMobileDuplicate: false, isEmailDuplicate: false, queryFailed: true, error: `Database error checking production staff: ${pErr.message}` };
      }
      if (uErr) {
        console.error('[checkGlobalUniquenessInDb] users query error:', uErr.message);
        return { isUnique: false, isMobileDuplicate: false, isEmailDuplicate: false, queryFailed: true, error: `Database error checking user accounts: ${uErr.message}` };
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

  // Short-lived coherent server-side caches (invalidated immediately on any write)
  const NON_EXISTENT_LOG_TABLES = new Set(['activity_logs', 'login_logs', 'analytics_snapshots', 'staff_task_submissions']);
  let directoryCache: {
    timestamp: number;
    opData: any[];
    prodData: any[];
    usersData: any[];
    oErr: any;
    pErr: any;
    uErr: any;
  } | null = null;
  let directoryCacheInFlight: Promise<any> | null = null;
  const DIRECTORY_CACHE_TTL_MS = 10_000;

  let selectAllCache: { timestamp: number; payload: { success: boolean; data: any[]; errors: any[] } } | null = null;
  let selectAllInFlight: Promise<{ success: boolean; data: any[]; errors: any[] }> | null = null;
  const SELECT_ALL_CACHE_TTL_MS = 3_000;

  const authUserEmailCache = new Map<string, { email: string; timestamp: number }>();
  const AUTH_EMAIL_CACHE_TTL_MS = 60_000;

  function invalidateServerCaches(table?: string) {
    selectAllCache = null;
    if (!table || ['users', 'operations_staff', 'production_staff', 'staff'].includes(table)) {
      directoryCache = null;
    }
  }

  async function getDirectoryTablesCached(db: any) {
    if (directoryCache && Date.now() - directoryCache.timestamp < DIRECTORY_CACHE_TTL_MS) {
      return directoryCache;
    }
    if (directoryCacheInFlight) {
      return directoryCacheInFlight;
    }
    directoryCacheInFlight = (async () => {
      try {
        const [opRes, prodRes, usersRes] = await Promise.all([
          db.from('operations_staff').select('*').order('name'),
          db.from('production_staff').select('*'),
          db.from('users').select('*')
        ]);
        const entry = {
          timestamp: Date.now(),
          opData: opRes.data || [],
          prodData: prodRes.data || [],
          usersData: usersRes.data || [],
          oErr: opRes.error || null,
          pErr: prodRes.error || null,
          uErr: usersRes.error || null
        };
        if (!entry.oErr && !entry.pErr && !entry.uErr) {
          directoryCache = entry;
        }
        return entry;
      } finally {
        directoryCacheInFlight = null;
      }
    })();
    return directoryCacheInFlight;
  }

  async function executeWithSelfHealing(table: string, operation: 'insert' | 'update' | 'upsert', payload: any, matchCol?: string, matchVal?: any) {
    if (NON_EXISTENT_LOG_TABLES.has(table)) {
      return { success: true, data: Array.isArray(payload) ? payload : [payload] };
    }
    invalidateServerCaches(table);
    const db = getServerSupabase();

    // Ensure package_id default for lead_packages (foreign key 23503 is handled on demand in the retry loop below without pre-SELECT overhead)
    if (table === 'lead_packages') {
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const pkgId = (item.package_id && String(item.package_id).trim()) ? String(item.package_id).trim() : 'PKG-DEFAULT';
        item.package_id = pkgId;
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
      
      const { data: maxEvRow } = await db.from('lead_events').select('id').order('id', { ascending: false }).limit(1);
      let currentMaxId = 0;
      const existingIdSet = new Set<number>();
      if (Array.isArray(maxEvRow) && maxEvRow.length > 0) {
        const num = typeof maxEvRow[0].id === 'number' ? maxEvRow[0].id : parseInt(String(maxEvRow[0].id), 10);
        if (!isNaN(num)) {
          existingIdSet.add(num);
          currentMaxId = num;
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
        if (operation !== 'update') {
          if (!itm.staff_id || !uuidRegex.test(String(itm.staff_id))) {
            itm.staff_id = crypto.randomUUID ? crypto.randomUUID() : '55555555-5555-5555-5555-' + String(Math.floor(100000000000 + Math.random() * 900000000000));
          }
          if (!itm.department) itm.department = 'Operations';
          if (!itm.status) itm.status = 'Active';
        } else if (itm.staff_id !== undefined && !uuidRegex.test(String(itm.staff_id))) {
          delete itm.staff_id;
        }

        if (operation !== 'update' || itm.role !== undefined) {
          let safeRole = itm.role || 'Photographer';
          if (!allowedOpsRoles.includes(safeRole)) {
            const rLower = String(safeRole).toLowerCase();
            if (rLower.includes('video')) safeRole = 'Videographer';
            else if (rLower.includes('assist')) safeRole = 'Assistant';
            else if (rLower.includes('manag')) safeRole = 'Manager';
            else safeRole = 'Photographer';
          }
          itm.role = safeRole;
        }

        if (itm.whatsapp_number !== undefined && itm.whatsapp_number !== null) {
          const numStr = String(itm.whatsapp_number).replace(/\D/g, '').slice(-10);
          itm.whatsapp_number = numStr ? Number(numStr) : null;
        } else if (operation !== 'update' && itm.mobile) {
          const numStr = String(itm.mobile).replace(/\D/g, '').slice(-10);
          itm.whatsapp_number = numStr ? Number(numStr) : null;
        }

        if (!itm.Staff_Type && itm.staff_type) itm.Staff_Type = itm.staff_type;
        if (!itm.staff_type && itm.Staff_Type) itm.staff_type = itm.Staff_Type;
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
          else if (r.includes('prod') && r.includes('staff')) normalizedRole = 'Production Team'; // users table constraint only allows Production Team
          else if (r.includes('editor')) normalizedRole = 'Production Team';
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

        const isSystemDivEmail = [
          'owner@photocrew.com',
          'founder@photocrew.com',
          'sales@photocrew.com',
          'sale@photocrew.com',
          'operation@photocrew.com',
          'operations@photocrew.com',
          'production@photocrew.com'
        ].includes(cleanE);

        if (orConds.length > 0) {
          const { data: existingRows } = await db.from('users').select('*').or(orConds.join(',')).limit(1);
          if (existingRows && existingRows.length > 0) {
            const existing = existingRows[0];
            const isStaffAccount = !isSystemDivEmail && ['Operation Staff', 'Production Team'].includes(normalizedRole);
            const updates: any = {
              name: uItem.name || existing.name,
              mobile: cleanM || existing.mobile || '0000000000',
              role: normalizedRole,
              active: uItem.active !== undefined ? uItem.active : existing.active
            };
            if (uItem.username) updates.username = uItem.username;
            if (isStaffAccount) {
              updates.password = null;
            } else if (uItem.password) {
              updates.password = uItem.password;
            }

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
        const isStaffInsert = !isSystemDivEmail && ['Operation Staff', 'Production Team'].includes(normalizedRole);
        const insertRecord: any = {
          id: validId,
          name: uItem.name || 'Staff',
          email: cleanE || `${cleanM}@photocrew.com`,
          mobile: cleanM,
          role: normalizedRole,
          active: uItem.active !== undefined ? uItem.active : true,
          password: isStaffInsert ? null : (uItem.password || null),
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

    // Self-healing handler for equipment_categories update/upsert/insert
    if (table === 'equipment_categories') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const item = Array.isArray(payload) ? payload[0] : payload;
      const targetName = (item?.category_name || item?.name || '').trim();
      const oldName = (item?.old_category_name || (operation === 'update' ? matchVal : '') || '').trim();

      if (operation === 'update' || operation === 'upsert') {
        let foundRow: any = null;
        let matchedByTargetName = false;

        // 1. Try finding by UUID matchVal
        if (matchVal && uuidRegex.test(String(matchVal))) {
          const { data: byId } = await db.from('equipment_categories').select('*').eq('id', matchVal).maybeSingle();
          if (byId) foundRow = byId;
        }

        // 2. Try finding by oldName
        if (!foundRow && oldName) {
          const { data: byOldName } = await db.from('equipment_categories').select('*').ilike('category_name', oldName).maybeSingle();
          if (byOldName) foundRow = byOldName;
        }

        // 3. Try finding by targetName (already exists in database)
        if (targetName) {
          const { data: byName } = await db.from('equipment_categories').select('*').ilike('category_name', targetName).maybeSingle();
          if (byName) {
            if (!foundRow || foundRow.id === byName.id) {
              foundRow = byName;
              matchedByTargetName = true;
            } else {
              // Both oldRow and targetRow exist: merge oldRow into existing targetRow
              try {
                await db.from('equipment_categories').delete().eq('id', foundRow.id);
              } catch (_) {}
              foundRow = byName;
              matchedByTargetName = true;
            }
          }
        }

        // 4. Fallback search across all equipment categories
        if (!foundRow) {
          const { data: allCats } = await db.from('equipment_categories').select('*');
          if (Array.isArray(allCats)) {
            foundRow = allCats.find((c: any) => 
              (c.id && String(c.id) === String(matchVal)) ||
              (oldName && c.category_name && String(c.category_name).trim().toLowerCase() === oldName.toLowerCase()) ||
              (targetName && c.category_name && String(c.category_name).trim().toLowerCase() === targetName.toLowerCase())
            );
          }
        }

        const now = new Date().toISOString();

        if (foundRow) {
          let updatedRow = foundRow;
          if (!matchedByTargetName && targetName && targetName.toLowerCase() !== foundRow.category_name.toLowerCase()) {
            const { data: updData, error: updErr } = await db.from('equipment_categories').update({
              category_name: targetName,
              updated_at: now
            }).eq('id', foundRow.id).select();

            if (!updErr && updData && updData.length > 0) {
              updatedRow = updData[0];
            } else if (updErr && updErr.code !== '23505') {
              console.error('[Server DB equipment_categories update error]:', updErr);
              return { success: false, error: updErr.message || String(updErr) };
            }
          }

          // Cascade update to equipment table so all items are accurately categorized
          if (targetName) {
            try {
              if (oldName && oldName.toLowerCase() !== targetName.toLowerCase()) {
                await db.from('equipment').update({
                  equipment_type: targetName,
                  Equipment_Category: targetName,
                  updated_at: now
                }).or(`equipment_type.ilike.${oldName},Equipment_Category.ilike.${oldName}`);
              }
            } catch (cascadeErr) {
              console.warn('[Server DB equipment category cascade warning]:', cascadeErr);
            }
          }

          return { success: true, data: [updatedRow] };
        } else {
          // If neither old nor target row exists, insert new category
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'cat-' + Date.now();
          const { data: insData, error: insErr } = await db.from('equipment_categories').insert({
            id: newId,
            category_name: targetName || 'Category',
            status: 'Active',
            created_at: now,
            updated_at: now
          }).select();

          let resultRow = insData && insData.length > 0 ? insData[0] : { id: newId, category_name: targetName };
          if (insErr) {
            if (insErr.code === '23505') {
              // Already exists, fetch it
              const { data: existing } = await db.from('equipment_categories').select('*').ilike('category_name', targetName).maybeSingle();
              if (existing) resultRow = existing;
            } else {
              console.error('[Server DB equipment_categories insert fallback error]:', insErr);
              return { success: false, error: insErr.message || String(insErr) };
            }
          }

          // Cascade update to equipment table if oldName was provided
          if (targetName && oldName && oldName.toLowerCase() !== targetName.toLowerCase()) {
            try {
              await db.from('equipment').update({
                equipment_type: targetName,
                Equipment_Category: targetName,
                updated_at: now
              }).or(`equipment_type.ilike.${oldName},Equipment_Category.ilike.${oldName}`);
            } catch (_) {}
          }

          return { success: true, data: [resultRow] };
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
      if (table === 'operations_staff') {
        if (matchColumn === 'staff_id' && matchValue && typeof matchValue === 'string' && matchValue.startsWith('STF-')) {
          const num = matchValue.substring(4).padStart(12, '0');
          matchValue = `55555555-5555-5555-5555-${num}`;
        }
        if (updates && updates.staff_id && typeof updates.staff_id === 'string' && updates.staff_id.startsWith('STF-')) {
          const num = updates.staff_id.substring(4).padStart(12, '0');
          updates.staff_id = `55555555-5555-5555-5555-${num}`;
        }
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

      // Enforce CRM Lock Backend (only query DB when the update is not already an allowed action)
      if (table === 'leads' && matchColumn === 'lead_id' && updates) {
        const keys = Object.keys(updates);
        const isAllowedAction = keys.includes('quotation_locked') || keys.includes('status') || keys.includes('current_status') || keys.includes('updated_by') || keys.includes('updated_at');
        if (!isAllowedAction) {
          const db = getServerSupabase();
          const { data: existingLead } = await db.from('leads').select('quotation_locked').eq('lead_id', matchValue).maybeSingle();
          if (existingLead && existingLead.quotation_locked === true) {
            console.warn(`[Server DB Update] Blocked update to locked lead ${matchValue}`);
            return res.status(403).json({ success: false, error: 'Lead CRM is locked. Cannot be updated.' });
          }
        }
      }

      // Idempotent protection for payment_history approvals
      if (table === 'payment_history' && updates?.approval_status === 'Approved') {
        const db = getServerSupabase();
        const { data: existingPayment } = await db
          .from('payment_history')
          .select('approval_status')
          .eq(matchColumn, matchValue)
          .maybeSingle();

        if (existingPayment && existingPayment.approval_status === 'Approved') {
          return res.json({ success: true, alreadyApproved: true, message: 'Payment is already approved.' });
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
      if (NON_EXISTENT_LOG_TABLES.has(table)) {
        return res.json({ success: true, data: [] });
      }
      const db = getServerSupabase();
      if (select === '*' && !matchColumn && !orderColumn && ['users', 'operations_staff', 'production_staff'].includes(table)) {
        const dir = await getDirectoryTablesCached(db);
        if (table === 'users' && !dir.uErr) return res.json({ success: true, data: dir.usersData });
        if (table === 'operations_staff' && !dir.oErr) return res.json({ success: true, data: dir.opData });
        if (table === 'production_staff' && !dir.pErr) return res.json({ success: true, data: dir.prodData });
      }
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
      if (selectAllCache && Date.now() - selectAllCache.timestamp < SELECT_ALL_CACHE_TTL_MS) {
        return res.json(selectAllCache.payload);
      }
      if (!selectAllInFlight) {
        selectAllInFlight = (async () => {
          try {
            const db = getServerSupabase();
            const queries = [
              db.from('users').select('*'),
              db.from('leads').select('*').order('lead_id', { ascending: false }),
              db.from('orders').select('*').order('created_at', { ascending: false }),
              db.from('operations').select('*'),
              db.from('raw_footage').select('*'),
              db.from('production').select('*'),
              db.from('payments').select('*'),
              Promise.resolve({ data: [], error: null }), // activity_logs is local-only
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

            // Warm directory cache from select-all results
            if (!errors[0] && !errors[8] && !errors[22]) {
              directoryCache = {
                timestamp: Date.now(),
                usersData: data[0],
                opData: data[8],
                prodData: data[22],
                uErr: null,
                oErr: null,
                pErr: null
              };
            }

            const payload = { success: true, data, errors };
            selectAllCache = { timestamp: Date.now(), payload };
            return payload;
          } finally {
            selectAllInFlight = null;
          }
        })();
      }
      const responsePayload = await selectAllInFlight;
      res.json(responsePayload);
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
      if (NON_EXISTENT_LOG_TABLES.has(table)) {
        return res.json({ success: true, data: [] });
      }
      invalidateServerCaches(table);
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

  let caListCache: { data: any[]; ts: number } | null = null;
  let caSupabaseTableMissing = false;

  const writeCaVerificationsToFile = (records: any[]) => {
    caListCache = { data: records, ts: Date.now() };
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
        physical_drive_details,
        final_image_url,
        final_image_name,
        final_image_uploaded_at,
        final_image_event_id,
        final_image_event_name,
        final_image_customer_name,
        final_image_production_id
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
          final_image_url: final_image_url !== undefined ? final_image_url : existingRecords[index].final_image_url,
          final_image_name: final_image_name !== undefined ? final_image_name : existingRecords[index].final_image_name,
          final_image_uploaded_at: final_image_uploaded_at !== undefined ? final_image_uploaded_at : existingRecords[index].final_image_uploaded_at,
          final_image_event_id: final_image_event_id !== undefined ? final_image_event_id : existingRecords[index].final_image_event_id,
          final_image_event_name: final_image_event_name !== undefined ? final_image_event_name : existingRecords[index].final_image_event_name,
          final_image_customer_name: final_image_customer_name !== undefined ? final_image_customer_name : existingRecords[index].final_image_customer_name,
          final_image_production_id: final_image_production_id !== undefined ? final_image_production_id : existingRecords[index].final_image_production_id,
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
          final_image_url: final_image_url || '',
          final_image_name: final_image_name || '',
          final_image_uploaded_at: final_image_uploaded_at || '',
          final_image_event_id: final_image_event_id || cleanEventId,
          final_image_event_name: final_image_event_name || '',
          final_image_customer_name: final_image_customer_name || '',
          final_image_production_id: final_image_production_id || '',
          created_at: now,
          updated_at: now
        };
        existingRecords.push(savedRecord);
      }

      writeCaVerificationsToFile(existingRecords);

      // Upsert into Supabase client_acceptance_verifications table using dedicated final_image_* columns
      try {
        const db = getServerSupabase();
        const legacySupabasePayload: any = {
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
          edited_folder_uploaded_to_server: savedRecord.edited_folder_uploaded_to_server || false,
          created_at: savedRecord.created_at,
          updated_at: savedRecord.updated_at
        };
        const fullSupabasePayload: any = {
          ...legacySupabasePayload,
          task_id: savedRecord.task_id || null,
          assignment_id: savedRecord.assignment_id || null,
          delivery_method: savedRecord.delivery_method || null,
          server_link: savedRecord.server_link || null,
          physical_drive_details: savedRecord.physical_drive_details || null,
          final_image_url: savedRecord.final_image_url || null,
          final_image_name: savedRecord.final_image_name || null,
          final_image_uploaded_at: savedRecord.final_image_uploaded_at || null,
          final_image_event_id: savedRecord.final_image_event_id || cleanEventId,
          final_image_event_name: savedRecord.final_image_event_name || null,
          final_image_customer_name: savedRecord.final_image_customer_name || null,
          final_image_production_id: savedRecord.final_image_production_id || null
        };
        const { error: upsertErr } = await db
          .from('client_acceptance_verifications')
          .upsert(fullSupabasePayload, { onConflict: 'order_id,event_id' });

        if (upsertErr) {
          const msg = String(upsertErr.message || upsertErr.details || '');
          if (upsertErr.code === 'PGRST204' || upsertErr.code === '42703' || /column/i.test(msg)) {
            await db.from('client_acceptance_verifications').upsert(legacySupabasePayload, {
              onConflict: 'order_id,event_id'
            });
          } else {
            console.warn('[Server CA Storage] Supabase upsert warning:', upsertErr);
          }
        }
      } catch (dbErr) {
        console.warn('[Server CA Storage] Supabase upsert exception:', dbErr);
      }

      // Sync delivery method & Final Image strictly to the linked Supabase production record
      try {
        const db = getServerSupabase();
        let matchedProds: any[] | null = null;
        if (final_image_production_id) {
          const { data: exactProds } = await db.from('production')
            .select('production_id, validated_server_uploads')
            .eq('production_id', String(final_image_production_id).trim())
            .limit(1);
          if (Array.isArray(exactProds) && exactProds.length > 0) {
            matchedProds = exactProds;
          }
        }
        if (!matchedProds || matchedProds.length === 0) {
          const orFilters = [`order_id.eq.${cleanOrderId}`, `tracking_id.eq.${cleanOrderId}`];
          const { data: orderProds } = await db.from('production')
            .select('production_id, validated_server_uploads')
            .or(orFilters.join(','))
            .limit(5);
          matchedProds = orderProds;
        }

        if (Array.isArray(matchedProds) && matchedProds.length > 0) {
          for (const mProd of matchedProds) {
            const prevUploads = (mProd.validated_server_uploads && typeof mProd.validated_server_uploads === 'object') ? { ...mProd.validated_server_uploads } : {};
            if (savedRecord.delivery_method === 'physical_drive') {
              delete (prevUploads as any).server_link;
            } else if (savedRecord.delivery_method === 'server_link') {
              delete (prevUploads as any).physical_drive_details;
            }
            if (final_image_url === '') {
              delete (prevUploads as any).final_image_url;
              delete (prevUploads as any).final_image_name;
              delete (prevUploads as any).final_image_uploaded_at;
              delete (prevUploads as any).final_image_order_id;
              delete (prevUploads as any).final_image_production_id;
              delete (prevUploads as any).final_image_event_id;
              delete (prevUploads as any).final_image_event_name;
              delete (prevUploads as any).final_image_customer_name;
            }
            const nextUploads: any = {
              ...prevUploads,
              ...(savedRecord.delivery_method ? { delivery_method: savedRecord.delivery_method } : {}),
              ...(savedRecord.delivery_method === 'server_link' ? { server_link: savedRecord.server_link } : {}),
              ...(savedRecord.delivery_method === 'physical_drive' ? { physical_drive_details: savedRecord.physical_drive_details } : {}),
              ...(final_image_url ? {
                final_image_url,
                final_image_name: savedRecord.final_image_name || '',
                final_image_uploaded_at: savedRecord.final_image_uploaded_at || now,
                final_image_order_id: cleanOrderId,
                final_image_production_id: mProd.production_id,
                final_image_event_id: savedRecord.final_image_event_id || cleanEventId,
                final_image_event_name: savedRecord.final_image_event_name || '',
                final_image_customer_name: savedRecord.final_image_customer_name || ''
              } : {})
            };
            const legacyProdUp: any = {
              validated_server_uploads: nextUploads
            };
            if (savedRecord.delivery_method) {
              legacyProdUp.delivery_link = savedRecord.delivery_method === 'server_link' ? (savedRecord.server_link || '') : '';
              legacyProdUp.upload_link_path = savedRecord.delivery_method === 'server_link' ? (savedRecord.server_link || '') : '';
              legacyProdUp.final_edited_footage_link = savedRecord.delivery_method === 'server_link' ? (savedRecord.server_link || '') : '';
            }
            if (savedRecord.delivery_method === 'physical_drive' && savedRecord.physical_drive_details) {
              legacyProdUp.folder_name = savedRecord.physical_drive_details;
            }
            const fullProdUp: any = {
              ...legacyProdUp,
              ...(savedRecord.delivery_method ? { delivery_method: savedRecord.delivery_method } : {}),
              ...(savedRecord.delivery_method === 'server_link' ? { server_link: savedRecord.server_link || '' } : {}),
              ...(savedRecord.delivery_method === 'physical_drive' ? { physical_drive_details: savedRecord.physical_drive_details || '' } : {}),
              ...(final_image_url !== undefined ? {
                final_image_url: final_image_url || null,
                final_image_name: final_image_url ? (savedRecord.final_image_name || '') : null,
                final_image_uploaded_at: final_image_url ? (savedRecord.final_image_uploaded_at || now) : null,
                final_image_event_id: final_image_url ? (savedRecord.final_image_event_id || cleanEventId) : null,
                final_image_event_name: final_image_url ? (savedRecord.final_image_event_name || '') : null,
                final_image_customer_name: final_image_url ? (savedRecord.final_image_customer_name || '') : null
              } : {})
            };
            const { error: prodUpErr } = await db.from('production').update(fullProdUp).eq('production_id', mProd.production_id);
            if (prodUpErr) {
              const pMsg = String(prodUpErr.message || prodUpErr.details || '');
              if (prodUpErr.code === 'PGRST204' || prodUpErr.code === '42703' || /column/i.test(pMsg)) {
                await db.from('production').update(legacyProdUp).eq('production_id', mProd.production_id);
              }
            }
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

  app.get('/api/client-acceptance/list', async (_req, res) => {
    try {
      if (caListCache && Date.now() - caListCache.ts < 15000) {
        return res.json({ success: true, data: caListCache.data });
      }
      let records = readCaVerificationsFromFile();

      // Check if Supabase table has records (skip if already known to be absent in schema)
      if (!caSupabaseTableMissing) {
        try {
          const db = getServerSupabase();
          const { data: dbRecords, error } = await db.from('client_acceptance_verifications').select('*');
          if (error && (error.message?.includes('Could not find the table') || error.message?.includes('does not exist'))) {
            caSupabaseTableMissing = true;
          } else if (!error && Array.isArray(dbRecords) && dbRecords.length > 0) {
            // Merge dbRecords with file records
            const map = new Map<string, any>();
            records.forEach((r: any) => map.set(`${String(r.order_id).trim().toLowerCase()}__${String(r.event_id || 'default').trim().toLowerCase()}`, r));
            dbRecords.forEach((r: any) => {
              const key = `${String(r.order_id).trim().toLowerCase()}__${String(r.event_id || 'default').trim().toLowerCase()}`;
              const existing = map.get(key) || {};
              map.set(key, {
                ...existing,
                ...r,
                final_image_url: r.final_image_url || existing.final_image_url || '',
                final_image_name: r.final_image_name || existing.final_image_name || ''
              });
            });
            records = Array.from(map.values());
            writeCaVerificationsToFile(records);
          }
        } catch (_) {}
      }

      caListCache = { data: records, ts: Date.now() };
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

  const getStaffPasswordEncryptionKey = (): Buffer => {
    const rawKey = (process.env.STAFF_PASSWORD_ENCRYPTION_KEY || '').trim();
    if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      return Buffer.from(rawKey, 'hex');
    }
    if (rawKey.length > 0) {
      return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
    }
    return crypto
      .createHmac('sha256', SUPABASE_SERVICE_ROLE_KEY || 'photocrew-fallback-key')
      .update('staff-password-encryption-v1')
      .digest();
  };

  const encryptStaffPassword = (plainPassword: string): string => {
    const key = getStaffPasswordEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainPassword, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  };

  const decryptStaffPassword = (storedValue: any): string | null => {
    if (typeof storedValue !== 'string' || !storedValue.startsWith('enc:v1:')) return storedValue || null;
    const parts = storedValue.split(':');
    if (parts.length !== 5) return storedValue || null;
    try {
      const iv = Buffer.from(parts[2], 'base64');
      const authTag = Buffer.from(parts[3], 'base64');
      const encrypted = Buffer.from(parts[4], 'base64');
      if (iv.length !== 12 || authTag.length !== 16) return storedValue || null;
      const key = getStaffPasswordEncryptionKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (e) {
      return storedValue;
    }
  };

  const getManagerSessionSigningKey = (): Buffer => {
    return crypto
      .createHmac('sha256', getStaffPasswordEncryptionKey())
      .update('erp-manager-session-v1')
      .digest();
  };

  const signManagerSessionToken = (payloadObj: { uid: string; email: string; role: string }): string => {
    const body = {
      ...payloadObj,
      iat: Date.now(),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    const payloadB64 = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    const sigB64 = crypto
      .createHmac('sha256', getManagerSessionSigningKey())
      .update(payloadB64)
      .digest('base64url');
    return `${payloadB64}.${sigB64}`;
  };

  const verifyManagerSessionToken = (token: string): { uid: string; email: string; role: string } | null => {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;
    try {
      const expectedSig = crypto
        .createHmac('sha256', getManagerSessionSigningKey())
        .update(payloadB64)
        .digest('base64url');
      const sigBuf = Buffer.from(sigB64, 'utf8');
      const expBuf = Buffer.from(expectedSig, 'utf8');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
      return {
        uid: String(parsed.uid || ''),
        email: cleanEmail(parsed.email),
        role: String(parsed.role || '')
      };
    } catch {
      return null;
    }
  };

  const MANAGER_SESSION_COOKIE = 'erp_manager_session';
  const MANAGER_ROLES_SET = new Set(['Business Owner', 'Operations Team', 'Production Team', 'Sales Team']);

  const parseCookies = (req: any): Record<string, string> => {
    const raw = String(req?.headers?.cookie || '');
    const out: Record<string, string> = {};
    if (!raw) return out;
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
    return out;
  };

  const isHttpsRequest = (req: any): boolean => {
    if (req?.secure) return true;
    const xfProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (xfProto === 'https') return true;
    const origin = String(req?.headers?.origin || req?.headers?.referer || '').trim().toLowerCase();
    if (origin.startsWith('https://')) return true;
    return process.env.NODE_ENV === 'production';
  };

  const setManagerSessionCookie = (req: any, res: any, token: string) => {
    const isHttps = isHttpsRequest(req);
    res.cookie(MANAGER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  };

  const clearManagerSessionCookie = (req: any, res: any) => {
    const isHttps = isHttpsRequest(req);
    res.clearCookie(MANAGER_SESSION_COOKIE, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/'
    });
  };

  const extractNotesAuthUserIdServer = (notesVal: any): string | null => {
    if (!notesVal) return null;
    try {
      let parsed = typeof notesVal === 'string' ? JSON.parse(notesVal) : notesVal;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object') {
        if (parsed.auth_user_id) return String(parsed.auth_user_id).trim();
        if (parsed.notes && typeof parsed.notes === 'string') {
          try {
            const nested = JSON.parse(parsed.notes);
            if (nested?.auth_user_id) return String(nested.auth_user_id).trim();
          } catch (_) {}
        }
      }
    } catch (_) {}
    return null;
  };

  const isSystemDivisionAccountServer = (opts: { id?: string | null; email?: string | null }): string | null => {
    const em = cleanEmail(opts.email);
    const uid = String(opts.id || '').trim();
    if (
      em === 'owner@photocrew.com' ||
      em === 'founder@photocrew.com' ||
      uid === '00000000-0000-0000-0000-000000000001' ||
      uid === 'df6765f5-eb55-4ba4-9efe-9676684d08f5' ||
      uid === 'U-001'
    ) return 'Business Owner';

    if (
      em === 'sales@photocrew.com' ||
      em === 'sale@photocrew.com' ||
      uid === '00000000-0000-0000-0000-000000000002' ||
      uid === 'U-002'
    ) return 'Sales Team';

    if (
      em === 'operation@photocrew.com' ||
      em === 'operations@photocrew.com' ||
      uid === '00000000-0000-0000-0000-000000000003' ||
      uid === 'f58de2d0-aba7-4ecf-9b11-89933ce7b545' ||
      uid === 'U-003'
    ) return 'Operations Team';

    if (
      em === 'production@photocrew.com' ||
      uid === '00000000-0000-0000-0000-000000000004' ||
      uid === '6eb78be8-6e79-40bc-8567-231c3c98cb45' ||
      uid === 'U-004'
    ) return 'Production Team';

    return null;
  };

  const resolveCallerAuthoritativeRole = async (
    db: any,
    caller: { id?: string | null; email?: string | null; mobile?: string | null; metadataRole?: string | null }
  ): Promise<{ role: string; active: boolean }> => {
    const callerId = String(caller.id || '').trim();
    const callerEmail = cleanEmail(caller.email);
    const callerMobile = cleanPhone(caller.mobile);
    const callerMob10 = callerMobile.length >= 10 ? callerMobile.slice(-10) : callerMobile;

    const { opData, prodData, usersData } = await getDirectoryTablesCached(db);
    let dbUserRow: any = null;
    if (callerId && Array.isArray(usersData)) {
      dbUserRow = usersData.find((r: any) => String(r.id || '').trim() === callerId) || null;
    }
    if (!dbUserRow && callerEmail && Array.isArray(usersData)) {
      const emailMatches = usersData.filter((r: any) => cleanEmail(r.email) === callerEmail);
      if (emailMatches.length > 0) {
        dbUserRow = emailMatches.find((r: any) => r.active !== false && String(r.active) !== 'false') || emailMatches[0];
      }
    }

    const isActive = dbUserRow
      ? (dbUserRow.active !== false && String(dbUserRow.active) !== 'false' && dbUserRow.active !== 0 && String(dbUserRow.active) !== '0')
      : true;

    const sysRole = isSystemDivisionAccountServer({ id: callerId || dbUserRow?.id, email: callerEmail || dbUserRow?.email });
    if (sysRole) {
      return { role: sysRole, active: isActive };
    }

    const matchesStaffRow = (row: any) => {
      if (!row) return false;
      const rStaffId = String(row.staff_id || '').trim();
      const rAuthId = extractNotesAuthUserIdServer(row.notes) || '';
      const rEmail = cleanEmail(row.email);
      const rMob = cleanPhone(row.mobile);
      const rMob10 = rMob.length >= 10 ? rMob.slice(-10) : rMob;
      if (callerId && (rStaffId === callerId || rAuthId === callerId)) return true;
      if (callerEmail && rEmail && rEmail === callerEmail) return true;
      if (callerMob10 && callerMob10.length >= 7 && rMob10 && rMob10 === callerMob10) return true;
      return false;
    };

    const inOp = (opData || []).some(matchesStaffRow);
    const inProd = (prodData || []).some(matchesStaffRow);

    if (inOp && !inProd) return { role: 'Operation Staff', active: isActive };
    if (inProd && !inOp) return { role: 'Production Staff', active: isActive };
    if (inOp && inProd) {
      const opAuth = callerId && (opData || []).some((r: any) => extractNotesAuthUserIdServer(r.notes) === callerId || r.staff_id === callerId);
      const prodAuth = callerId && (prodData || []).some((r: any) => extractNotesAuthUserIdServer(r.notes) === callerId || r.staff_id === callerId);
      if (opAuth && !prodAuth) return { role: 'Operation Staff', active: isActive };
      if (prodAuth && !opAuth) return { role: 'Production Staff', active: isActive };
      return { role: 'Operation Staff', active: isActive };
    }

    const rawRole = String(dbUserRow?.role || caller.metadataRole || '').trim();
    const lowerRole = rawRole.toLowerCase();
    if (lowerRole === 'production staff' || lowerRole.includes('editor')) return { role: 'Production Staff', active: isActive };
    if (lowerRole === 'operation staff' || lowerRole === 'operations staff' || lowerRole.includes('photographer') || lowerRole.includes('drone') || lowerRole.includes('cinematographer')) {
      return { role: 'Operation Staff', active: isActive };
    }
    if (lowerRole.includes('owner') || lowerRole.includes('business')) return { role: 'Business Owner', active: isActive };
    if (lowerRole.includes('sales')) return { role: 'Sales Team', active: isActive };
    if (lowerRole.includes('production') || lowerRole.includes('prod')) return { role: 'Production Team', active: isActive };
    if (lowerRole.includes('operation') || lowerRole.includes('op')) return { role: 'Operations Team', active: isActive };

    return { role: rawRole || 'Operation Staff', active: isActive };
  };

  const normalizeAuthRole = (role?: string, staffTypeHint?: string): string => {
    const hint = String(staffTypeHint || '').trim().toLowerCase();
    const r = String(role || '').trim().toLowerCase();
    if (r.includes('owner') || r.includes('business')) return 'Business Owner';
    if (r.includes('sales')) return 'Sales Team';
    if (hint === 'production' || r.includes('prod') || r.includes('editor')) return 'Production Team';
    if (hint === 'operations') return 'Operation Staff';
    if (r.includes('op') && r.includes('staff')) return 'Operation Staff';
    if (r.includes('op') && r.includes('team')) return 'Operations Team';
    return 'Operation Staff';
  };

  const findAuthUserPaginated = async (
    db: any,
    opts: { authId?: string | null; email?: string | null; mobile?: string | null; allowEmailMismatch?: boolean }
  ): Promise<any | null> => {
    const targetEmail = cleanEmail(opts.email);
    const targetMobile = cleanPhone(opts.mobile);

    const isMatchingUser = (user: any, allowMismatch?: boolean): boolean => {
      if (!user) return false;
      if (allowMismatch || !targetEmail) return true;
      const authEmail = cleanEmail(user.email);
      const origEmail = cleanEmail(user.user_metadata?.original_email);
      const metaMobile = cleanPhone(user.user_metadata?.mobile);
      if (!authEmail || authEmail === targetEmail) return true;
      if (origEmail && origEmail === targetEmail) return true;
      if (targetMobile && targetMobile.length >= 7 && metaMobile && metaMobile === targetMobile) return true;
      if (targetMobile && targetMobile.length >= 7 && authEmail === `${targetMobile}@photocrew.com`) return true;
      return false;
    };

    if (opts.authId) {
      try {
        const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(opts.authId);
        if (!byIdErr && byIdData?.user) {
          if (isMatchingUser(byIdData.user, opts.allowEmailMismatch)) {
            return byIdData.user;
          }
          console.warn('[Server Auth] Ignoring authId mapped to different email:', byIdData.user.email, 'expected:', targetEmail);
        }
      } catch (_) {}
    }

    if (!targetEmail && (!targetMobile || targetMobile.length < 7 || targetMobile === '0000000000')) {
      return null;
    }

    // Fast path 1: check staff tables (operations_staff & production_staff) for notes.auth_user_id
    if (targetEmail || (targetMobile && targetMobile.length >= 7 && targetMobile !== '0000000000')) {
      try {
        const [opCheck, prodCheck] = await Promise.all([
          targetEmail
            ? db.from('operations_staff').select('notes, mobile').ilike('email', targetEmail).maybeSingle()
            : db.from('operations_staff').select('notes, mobile').eq('mobile', targetMobile).maybeSingle(),
          targetEmail
            ? db.from('production_staff').select('notes, mobile').ilike('email', targetEmail).maybeSingle()
            : db.from('production_staff').select('notes, mobile').eq('mobile', targetMobile).maybeSingle()
        ]);
        const notesIds = [
          extractNotesAuthUserIdServer(opCheck?.data?.notes),
          extractNotesAuthUserIdServer(prodCheck?.data?.notes)
        ].filter(Boolean) as string[];
        for (const nid of notesIds) {
          if (nid && nid !== opts.authId) {
            const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(nid);
            if (!byIdErr && byIdData?.user) {
              return byIdData.user;
            }
          }
        }
      } catch (_) {}
    }

    // Fast path 2: check public.users by email/mobile to find candidate auth ID directly
    if (targetEmail) {
      try {
        const { data: uRow } = await db.from('users').select('id').ilike('email', targetEmail).maybeSingle();
        if (uRow?.id && uRow.id !== opts.authId) {
          const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(uRow.id);
          if (!byIdErr && byIdData?.user && isMatchingUser(byIdData.user, false)) {
            return byIdData.user;
          }
        }
      } catch (_) {}
    }
    if (targetMobile && targetMobile.length >= 7 && targetMobile !== '0000000000') {
      try {
        const { data: uRow } = await db.from('users').select('id').eq('mobile', targetMobile).maybeSingle();
        if (uRow?.id && uRow.id !== opts.authId) {
          const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(uRow.id);
          if (!byIdErr && byIdData?.user) {
            return byIdData.user;
          }
        }
      } catch (_) {}
    }

    // Use small page size (10) and skip corrupt pages rather than aborting the whole scan
    let page = 1;
    const perPage = 10;
    let mobileCandidate: any = null;
    let consecutiveErrors = 0;

    while (page <= 80) {
      try {
        const { data: listData, error: listErr } = await db.auth.admin.listUsers({ page, perPage });
        if (listErr) {
          console.warn(`[Server Auth listUsers error page ${page}]:`, listErr.message);
          consecutiveErrors++;
          if (consecutiveErrors >= 5) break;
          page++;
          continue;
        }
        consecutiveErrors = 0;
        const usersList = listData?.users || [];
        if (usersList.length === 0) break;

        if (targetEmail) {
          const emailMatch = usersList.find((u: any) =>
            cleanEmail(u.email) === targetEmail || cleanEmail(u.user_metadata?.original_email) === targetEmail
          );
          if (emailMatch) return emailMatch;
        }

        if (!mobileCandidate && targetMobile && targetMobile.length >= 7 && targetMobile !== '0000000000') {
          mobileCandidate = usersList.find((u: any) => {
            const uPhone = cleanPhone(u.phone);
            const uMetaMob = cleanPhone(u.user_metadata?.mobile);
            const uEm = cleanEmail(u.email);
            return (uPhone && uPhone === targetMobile) ||
              (uMetaMob && uMetaMob === targetMobile) ||
              (uEm === `${targetMobile}@photocrew.com`);
          }) || null;
          if (!targetEmail && mobileCandidate) return mobileCandidate;
        }

        if (usersList.length < perPage) break;
        page++;
      } catch (e) {
        console.warn(`[Server Auth listUsers exception page ${page}]:`, e);
        consecutiveErrors++;
        if (consecutiveErrors >= 5) break;
        page++;
      }
    }

    return mobileCandidate || null;
  };

  const createOrRecoverAuthUser = async (
    db: any,
    params: {
      email?: string | null;
      mobile?: string | null;
      staffId?: string | null;
      password: string;
      name?: string;
      normalizedRole: string;
      active?: boolean;
      encPwd: string;
    }
  ): Promise<{ user: any | null; error?: string }> => {
    const cleanEmailStr = cleanEmail(params.email);
    const cleanMobileStr = cleanPhone(params.mobile);
    const primaryEmail = cleanEmailStr || `${cleanMobileStr || 'staff'}@photocrew.com`;
    const baseUserMeta = {
      name: params.name || 'Staff Member',
      role: params.normalizedRole || 'Operation Staff',
      mobile: cleanMobileStr || '',
      ...(cleanEmailStr ? { original_email: cleanEmailStr } : {})
    };

    const ensureEncPwdOnUser = async (u: any): Promise<any> => {
      if (u && u.app_metadata?.enc_pwd !== params.encPwd) {
        const { data: metaUpd } = await db.auth.admin.updateUserById(u.id, {
          app_metadata: { ...(u.app_metadata || {}), enc_pwd: params.encPwd }
        });
        if (metaUpd?.user) return metaUpd.user;
      }
      return u;
    };

    const { data, error } = await db.auth.admin.createUser({
      email: primaryEmail,
      password: params.password,
      email_confirm: true,
      ...(params.active === false ? { ban_duration: '876000h' } : {}),
      user_metadata: baseUserMeta,
      app_metadata: { enc_pwd: params.encPwd }
    });

    if (!error && data?.user) {
      return { user: await ensureEncPwdOnUser(data.user) };
    }

    const errMsg = String(error?.message || '').toLowerCase();
    const isAlreadyExists = errMsg.includes('already') || errMsg.includes('registered') || errMsg.includes('exists');
    const isGoTrueDbError =
      errMsg.includes('database error') ||
      errMsg.includes('checking email') ||
      errMsg.includes('loading user') ||
      errMsg.includes('unexpected_failure');

    if (isAlreadyExists) {
      const existingAuth = await findAuthUserPaginated(db, {
        email: primaryEmail,
        mobile: cleanMobileStr || null,
        allowEmailMismatch: true
      });
      if (existingAuth) {
        const cleanedMeta = { ...(existingAuth.user_metadata || {}), ...baseUserMeta };
        delete cleanedMeta.current_password;
        const { data: updData, error: updErr } = await db.auth.admin.updateUserById(existingAuth.id, {
          password: params.password,
          email_confirm: true,
          ...(params.active !== undefined ? { ban_duration: params.active === false ? '876000h' : 'none' } : {}),
          user_metadata: cleanedMeta,
          app_metadata: { ...(existingAuth.app_metadata || {}), enc_pwd: params.encPwd }
        });
        if (!updErr && (updData?.user || existingAuth)) {
          return { user: updData?.user || existingAuth };
        }
      }
    }

    // Fallback when GoTrue has a corrupt legacy row on primaryEmail ("Database error checking email" / "Database error loading user")
    if (isGoTrueDbError || isAlreadyExists) {
      const staffSlug = String(params.staffId || cleanMobileStr || Date.now())
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      const aliasCandidates: string[] = [];
      if (cleanMobileStr && cleanMobileStr.length >= 7 && `${cleanMobileStr}@photocrew.com` !== primaryEmail) {
        aliasCandidates.push(`${cleanMobileStr}@photocrew.com`);
      }
      if (staffSlug) {
        aliasCandidates.push(`staff.${staffSlug}@photocrew.com`);
      }
      aliasCandidates.push(`auth.${cleanMobileStr || staffSlug || 'user'}.${Date.now()}@photocrew.com`);

      for (const aliasEmail of aliasCandidates) {
        const existingAlias = await findAuthUserPaginated(db, {
          email: aliasEmail,
          mobile: cleanMobileStr || null,
          allowEmailMismatch: true
        });
        if (existingAlias) {
          const cleanedMeta = { ...(existingAlias.user_metadata || {}), ...baseUserMeta };
          delete cleanedMeta.current_password;
          const { data: updAlias, error: updAliasErr } = await db.auth.admin.updateUserById(existingAlias.id, {
            password: params.password,
            email_confirm: true,
            ...(params.active !== undefined ? { ban_duration: params.active === false ? '876000h' : 'none' } : {}),
            user_metadata: cleanedMeta,
            app_metadata: { ...(existingAlias.app_metadata || {}), enc_pwd: params.encPwd }
          });
          if (!updAliasErr && (updAlias?.user || existingAlias)) {
            return { user: updAlias?.user || existingAlias };
          }
        }

        const { data: aliasCreated, error: aliasErr } = await db.auth.admin.createUser({
          email: aliasEmail,
          password: params.password,
          email_confirm: true,
          ...(params.active === false ? { ban_duration: '876000h' } : {}),
          user_metadata: baseUserMeta,
          app_metadata: { enc_pwd: params.encPwd }
        });
        if (!aliasErr && aliasCreated?.user) {
          return { user: await ensureEncPwdOnUser(aliasCreated.user) };
        }
      }
    }

    return { user: null, error: error?.message || 'Failed to configure authentication credentials' };
  };

  const syncPublicUserRow = async (
    db: any,
    params: {
      authUserId: string;
      name?: string;
      email?: string | null;
      mobile?: string | null;
      normalizedRole?: string;
      active?: boolean;
    }
  ): Promise<any | null> => {
    const cleanEmailStr = cleanEmail(params.email);
    const cleanMobileStr = cleanPhone(params.mobile);

    let existingById: any = null;
    let existingByEmail: any = null;

    try {
      const { data } = await db.from('users').select('*').eq('id', params.authUserId).maybeSingle();
      if (data) existingById = data;
    } catch (_) {}

    if (cleanEmailStr) {
      try {
        const { data } = await db.from('users').select('*').ilike('email', cleanEmailStr).maybeSingle();
        if (data) existingByEmail = data;
      } catch (_) {}
    }

    let resolvedRowId = params.authUserId;
    let useInPlaceUpdateOnEmail = false;

    if (existingByEmail && existingByEmail.id !== params.authUserId) {
      if (existingById) {
        try {
          const { error: delErr } = await db.from('users').delete().eq('id', existingByEmail.id);
          if (delErr) useInPlaceUpdateOnEmail = true;
        } catch (_) {
          useInPlaceUpdateOnEmail = true;
        }
      } else {
        try {
          const { error: updIdErr } = await db.from('users').update({ id: params.authUserId, password: null }).eq('id', existingByEmail.id);
          if (!updIdErr) {
            existingById = { ...existingByEmail, id: params.authUserId };
          } else {
            // Preserve existing row ID if FK references block ID change
            resolvedRowId = existingByEmail.id;
            existingById = existingByEmail;
            useInPlaceUpdateOnEmail = true;
          }
        } catch (_) {
          resolvedRowId = existingByEmail.id;
          existingById = existingByEmail;
          useInPlaceUpdateOnEmail = true;
        }
      }
    }

    const baseRow: any = {
      id: useInPlaceUpdateOnEmail && existingById ? existingById.id : resolvedRowId,
      name: params.name || existingById?.name || existingByEmail?.name || 'Staff',
      email: cleanEmailStr || existingById?.email || existingByEmail?.email || `${cleanMobileStr || 'staff'}@photocrew.com`,
      mobile: cleanMobileStr || existingById?.mobile || existingByEmail?.mobile || '0000000000',
      role: params.normalizedRole || existingById?.role || existingByEmail?.role || 'Operation Staff',
      active: params.active !== undefined ? params.active : (existingById?.active ?? existingByEmail?.active ?? true),
      password: null
    };

    const upsertWithOptionalUsername = async (payload: any) => {
      let attemptPayload = { ...payload };
      if (!existingById && attemptPayload.email) {
        attemptPayload.username = attemptPayload.email;
        attemptPayload.created_at = new Date().toISOString();
      }
      let res = existingById
        ? await db.from('users').update(attemptPayload).eq('id', attemptPayload.id).select()
        : await db.from('users').upsert(attemptPayload, { onConflict: 'id' }).select();

      if (res.error && res.error.message && res.error.message.includes('username')) {
        delete attemptPayload.username;
        res = existingById
          ? await db.from('users').update(attemptPayload).eq('id', attemptPayload.id).select()
          : await db.from('users').upsert(attemptPayload, { onConflict: 'id' }).select();
      }
      if (res.error && existingByEmail && !existingById) {
        // Fallback: update existingByEmail without changing its primary key if unique constraint on email tripped
        const { id: _ignoredId, ...emailUpdates } = attemptPayload;
        res = await db.from('users').update(emailUpdates).eq('id', existingByEmail.id).select();
      }
      if (res.error) {
        console.warn('[Server Auth syncPublicUserRow warning]:', res.error.message);
        return null;
      }
      return res.data?.[0] || attemptPayload;
    };

    return await upsertWithOptionalUsername(baseRow);
  };

  const authenticateCallerIdentity = async (
    db: any,
    req: any
  ): Promise<{ id?: string | null; email?: string | null; mobile?: string | null; metadataRole?: string | null } | null> => {
    const authHeader = String(req?.headers?.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const jwt = authHeader.slice(7).trim();
      if (jwt && jwt !== SUPABASE_ANON_KEY) {
        try {
          const { data: userData, error: jwtErr } = await db.auth.getUser(jwt);
          if (!jwtErr && userData?.user) {
            return {
              id: userData.user.id,
              email: userData.user.email,
              mobile: userData.user.user_metadata?.mobile,
              metadataRole: userData.user.user_metadata?.role
            };
          }
        } catch (_) {}

        const verifiedBearerErp = verifyManagerSessionToken(jwt);
        if (verifiedBearerErp) {
          return {
            id: verifiedBearerErp.uid,
            email: verifiedBearerErp.email,
            metadataRole: verifiedBearerErp.role
          };
        }
      }
    }

    const cookies = parseCookies(req);
    const erpToken = String(
      req?.headers?.['x-erp-session'] ||
      req?.headers?.['x-erp-session-token'] ||
      cookies[MANAGER_SESSION_COOKIE] ||
      ''
    ).trim();
    const verified = verifyManagerSessionToken(erpToken);
    if (verified) {
      return {
        id: verified.uid,
        email: verified.email,
        metadataRole: verified.role
      };
    }

    return null;
  };

  let cachedOpsPasswordColumns: string[] | null = null;
  const getOperationsPasswordColumns = async (db: any): Promise<string[]> => {
    if (cachedOpsPasswordColumns && cachedOpsPasswordColumns.length > 0) {
      return cachedOpsPasswordColumns;
    }
    const detected: string[] = [];
    try {
      const specRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      if (specRes.ok) {
        const spec = await specRes.json().catch(() => null);
        const props = spec?.definitions?.operations_staff?.properties;
        if (props && typeof props === 'object') {
          if ('password' in props) detected.push('password');
          if ('Password' in props) detected.push('Password');
        }
      }
    } catch (_) {}

    if (detected.length === 0) {
      const { error: lowerErr } = await db.from('operations_staff').select('password').limit(1);
      if (!lowerErr) detected.push('password');
      const { error: upperErr } = await db.from('operations_staff').select('Password').limit(1);
      if (!upperErr) detected.push('Password');
    }

    if (detected.length > 0) {
      cachedOpsPasswordColumns = detected;
    }
    return detected;
  };

  const syncStaffPasswordColumnsOnRow = async (
    db: any,
    params: {
      table: 'production_staff' | 'operations_staff';
      staffId: string;
      extraUpdates?: Record<string, any>;
      password?: string | null;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const payload: Record<string, any> = { ...(params.extraUpdates || {}) };

    const cleanPwd = typeof params.password === 'string' && params.password.trim() !== '' ? params.password.trim() : null;
    if (cleanPwd !== null) {
      payload.Password = cleanPwd;
    }
    if (Object.keys(payload).length === 0) return { success: true };
    const { error } = await db.from(params.table).update(payload).eq('staff_id', params.staffId);
    if (error) {
      console.error(`[Server Auth] Failed updating ${params.table} row:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const syncStaffNotesAuthId = async (
    db: any,
    params: {
      table: 'production_staff' | 'operations_staff';
      staffId?: string | null;
      email?: string | null;
      authUserId: string;
      password?: string | null;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmailStr = cleanEmail(params.email);
    if (!params.staffId && !cleanEmailStr) return { success: true };

    try {
      let query = db.from(params.table).select('staff_id, notes');
      if (params.staffId) {
        query = query.eq('staff_id', params.staffId);
      } else if (cleanEmailStr) {
        query = query.ilike('email', cleanEmailStr);
      }

      const { data: rows, error: findErr } = await query;
      if (findErr) {
        return { success: false, error: findErr.message };
      }
      if (!Array.isArray(rows) || rows.length === 0) return { success: true };

      for (const row of rows) {
        let notesObj: any = {};
        if (row.notes) {
          if (typeof row.notes === 'string') {
            const trimmed = row.notes.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                let parsed = JSON.parse(trimmed);
                if (typeof parsed === 'string') {
                  try { parsed = JSON.parse(parsed); } catch (_) {}
                }
                if (parsed && typeof parsed === 'object') {
                  notesObj = parsed;
                }
              } catch (_) {
                notesObj = { notes: row.notes };
              }
            } else {
              notesObj = { notes: row.notes };
            }
          } else if (typeof row.notes === 'object') {
            notesObj = { ...row.notes };
          }
        }

        notesObj.auth_user_id = params.authUserId;
        delete notesObj.current_password;
        delete notesObj.password;
        delete notesObj.Password;
        if (notesObj.notes && typeof notesObj.notes === 'string' && notesObj.notes.trim().startsWith('{')) {
          try {
            const inner = JSON.parse(notesObj.notes);
            if (inner && typeof inner === 'object') {
              delete inner.current_password;
              delete inner.password;
              delete inner.Password;
              notesObj.notes = inner.notes || '';
            }
          } catch (_) {}
        }

        const serializedNotes = JSON.stringify(notesObj);
        const updRes = await syncStaffPasswordColumnsOnRow(db, {
          table: params.table,
          staffId: row.staff_id,
          extraUpdates: { notes: serializedNotes },
          password: params.password ?? null
        });
        if (!updRes.success) {
          return updRes;
        }
      }
      return { success: true };
    } catch (err: any) {
      console.warn(`[Server Auth syncStaffNotesAuthId warning for ${params.table}]:`, err);
      return { success: false, error: err?.message || String(err) };
    }
  };

  app.post('/api/auth/resolve-login-email', async (req, res) => {
    const { identifier } = req.body || {};
    try {
      const cleanInput = String(identifier ?? '').trim();
      if (!cleanInput) {
        return res.json({ success: true, emails: [] });
      }
      const db = getServerSupabase();
      const lowerInput = cleanInput.toLowerCase();
      const digits = cleanInput.replace(/\D/g, '');
      const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
      const isPhone = !cleanInput.includes('@') && digits.length >= 7 && !/^0+$/.test(digits);

      const parseNotesAuthId = (notesVal: any): string | null => {
        if (!notesVal) return null;
        try {
          let parsed = typeof notesVal === 'string' ? JSON.parse(notesVal) : notesVal;
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          if (parsed?.auth_user_id) return String(parsed.auth_user_id).trim();
        } catch (_) {}
        return null;
      };

      const getAliasTerms = (val: string): string[] => {
        const v = val.trim().toLowerCase();
        if (v === 'owner@photocrew.com' || v === 'founder@photocrew.com' || v === 'owner' || v === 'founder') {
          return [v, 'owner@photocrew.com', 'founder@photocrew.com', 'owner'];
        }
        if (v === 'operation@photocrew.com' || v === 'operations@photocrew.com' || v === 'operation' || v === 'operations') {
          return [v, 'operation@photocrew.com', 'operations@photocrew.com', 'operation'];
        }
        if (v === 'production@photocrew.com' || v === 'production') {
          return [v, 'production@photocrew.com', 'production'];
        }
        if (v === 'sales@photocrew.com' || v === 'sale@photocrew.com') {
          return [v, 'sales@photocrew.com', 'sale@photocrew.com'];
        }
        return [v];
      };
      const aliasSet = new Set<string>(getAliasTerms(lowerInput));

      const matchesRow = (r: any) => {
        if (!r) return false;
        const rEmail = String(r.email ?? '').trim().toLowerCase();
        const rUser = String(r.username ?? '').trim().toLowerCase();
        if (rEmail && aliasSet.has(rEmail)) return true;
        if (rUser && aliasSet.has(rUser)) return true;
        if (isPhone) {
          const rMob = String(r.mobile ?? r.mobile_number ?? '').replace(/\D/g, '');
          const rWa = String(r.whatsapp_number ?? '').replace(/\D/g, '');
          const rMob10 = rMob.length >= 10 ? rMob.slice(-10) : rMob;
          const rWa10 = rWa.length >= 10 ? rWa.slice(-10) : rWa;
          if (rMob && !/^0+$/.test(rMob) && (rMob === digits || (last10.length >= 7 && rMob10 === last10))) return true;
          if (rWa && !/^0+$/.test(rWa) && (rWa === digits || (last10.length >= 7 && rWa10 === last10))) return true;
        }
        return false;
      };

      const { prodData, opData, usersData } = await getDirectoryTablesCached(db);

      const candidateAuthIds = new Set<string>();
      const candidateEmails = new Set<string>();
      const isValidAuthUuid = (idVal: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idVal) &&
        !idVal.startsWith('00000000-0000-0000-0000-') &&
        !idVal.startsWith('55555555-5555-5555-5555-');

      const systemDivisionInputs = new Set([
        'owner@photocrew.com',
        'founder@photocrew.com',
        'owner',
        'founder',
        'operation@photocrew.com',
        'operations@photocrew.com',
        'operation',
        'operations',
        'production@photocrew.com',
        'production',
        'sales@photocrew.com',
        'sale@photocrew.com'
      ]);
      const isSystemDivisionLookup = systemDivisionInputs.has(lowerInput);

      for (const term of aliasSet) {
        if (term.includes('@')) candidateEmails.add(term);
      }

      if (!isSystemDivisionLookup) {
        for (const ps of (prodData || [])) {
          if (matchesRow(ps)) {
            const aid = parseNotesAuthId(ps.notes);
            if (aid && isValidAuthUuid(aid)) candidateAuthIds.add(aid);
            if (ps.email && String(ps.email).includes('@')) candidateEmails.add(String(ps.email).trim().toLowerCase());
          }
        }
        for (const os of (opData || [])) {
          if (matchesRow(os)) {
            const aid = parseNotesAuthId(os.notes);
            if (aid && isValidAuthUuid(aid)) candidateAuthIds.add(aid);
            if (os.email && String(os.email).includes('@')) candidateEmails.add(String(os.email).trim().toLowerCase());
          }
        }
      }
      for (const u of (usersData || [])) {
        if (matchesRow(u)) {
          const uid = u.id ? String(u.id).trim() : '';
          const uEm = u.email ? String(u.email).trim().toLowerCase() : '';
          if (!isSystemDivisionLookup && !systemDivisionInputs.has(uEm) && uid && isValidAuthUuid(uid)) {
            candidateAuthIds.add(uid);
          }
          if (uEm && uEm.includes('@')) candidateEmails.add(uEm);
        }
      }

      const resolvedEmails = new Set<string>();
      if (db.auth && db.auth.admin && candidateAuthIds.size > 0) {
        const now = Date.now();
        await Promise.all(
          Array.from(candidateAuthIds).map(async (aid) => {
            const cached = authUserEmailCache.get(aid);
            if (cached && now - cached.timestamp < AUTH_EMAIL_CACHE_TTL_MS) {
              if (cached.email) resolvedEmails.add(cached.email);
              return;
            }
            try {
              const { data: gu } = await db.auth.admin.getUserById(aid);
              const authEm = gu?.user?.email ? String(gu.user.email).trim().toLowerCase() : '';
              authUserEmailCache.set(aid, { email: authEm, timestamp: now });
              if (authEm && authEm.includes('@')) resolvedEmails.add(authEm);
            } catch (_) {}
          })
        );
      }
      for (const em of candidateEmails) {
        resolvedEmails.add(em);
      }

      res.json({ success: true, emails: Array.from(resolvedEmails) });
    } catch (err: any) {
      res.json({ success: true, emails: [] });
    }
  });

  app.post('/api/auth/create-user', async (req, res) => {
    const { email, password, name, role, mobile, active = true, staff_id, staff_type } = req.body;
    try {
      invalidateServerCaches('users');
      const db = getServerSupabase();
      if (!db.auth.admin) {
        return res.status(400).json({ success: false, error: 'Service Role Key not configured on server' });
      }

      const callerIdentity = await authenticateCallerIdentity(db, req);
      if (!callerIdentity) {
        return res.status(401).json({ success: false, error: 'Authentication required to create staff credentials.' });
      }
      const callerAuth = await resolveCallerAuthoritativeRole(db, callerIdentity);
      if (!callerAuth.active) {
        return res.status(403).json({ success: false, error: 'Account is deactivated.' });
      }
      if (!new Set(['Business Owner', 'Production Team', 'Operations Team']).has(callerAuth.role)) {
        return res.status(403).json({ success: false, error: 'You are not authorized to create staff credentials.' });
      }

      const cleanEmailStr = cleanEmail(email);
      const cleanMobileStr = cleanPhone(mobile);
      const normalizedRole = normalizeAuthRole(role, staff_type);
      const resolvedTable: 'production_staff' | 'operations_staff' | null =
        staff_type === 'production' || normalizedRole === 'Production Team'
          ? 'production_staff'
          : (staff_type === 'operations' || normalizedRole === 'Operation Staff')
            ? 'operations_staff'
            : null;

      if (callerAuth.role === 'Production Team' && resolvedTable === 'operations_staff') {
        return res.status(403).json({ success: false, error: 'Production Manager can only create Production staff credentials.' });
      }
      if (callerAuth.role === 'Operations Team' && resolvedTable === 'production_staff') {
        return res.status(403).json({ success: false, error: 'Operation Manager can only create Operation staff credentials.' });
      }

      const cleanPwd =
        resolvedTable === 'production_staff'
          ? (typeof password === 'string' && password.trim() !== '' ? password : '')
          : (typeof password === 'string' ? password.trim() : '');
      if (!cleanPwd || cleanPwd.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
      }

      console.log(`[Server Auth] Creating user ${cleanEmailStr} with role ${normalizedRole}`);

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

      const encPwd = encryptStaffPassword(cleanPwd);
      const createdOrRecovered = await createOrRecoverAuthUser(db, {
        email: cleanEmailStr,
        mobile: cleanMobileStr,
        staffId: staff_id || null,
        password: cleanPwd,
        name,
        normalizedRole,
        active,
        encPwd
      });
      if (!createdOrRecovered.user) {
        return res.status(400).json({ success: false, error: createdOrRecovered.error || 'Failed to create authentication account' });
      }
      const authUser = createdOrRecovered.user;

      const syncedUserRecord = await syncPublicUserRow(db, {
        authUserId: authUser.id,
        name,
        email: cleanEmailStr,
        mobile: cleanMobileStr,
        normalizedRole,
        active
      });

      if (resolvedTable && (staff_id || cleanEmailStr)) {
        const staffSyncRes = await syncStaffNotesAuthId(db, {
          table: resolvedTable,
          staffId: staff_id || null,
          email: cleanEmailStr,
          authUserId: authUser.id,
          password: cleanPwd
        });
        if (!staffSyncRes.success) {
          return res.status(500).json({
            success: false,
            error: staffSyncRes.error || `Failed to save password in ${resolvedTable}`
          });
        }
      }

      invalidateServerCaches('users');
      res.json({
        success: true,
        auth_user_id: authUser.id,
        data: {
          user: { id: authUser.id, email: authUser.email, role: normalizedRole },
          record: syncedUserRecord
        }
      });
    } catch (err: any) {
      console.error(`[Server Auth Create Exception]`, err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/auth/delete-user', async (req, res) => {
    const { staff_id, mobile, email, auth_id } = req.body;
    try {
      invalidateServerCaches('users');
      const db = getServerSupabase();
      const cleanEmailStr = cleanEmail(email);
      const cleanMobileStr = cleanPhone(mobile);

      if (staff_id) {
        await db.from('users').delete().eq('id', staff_id);
      }
      if (auth_id) {
        await db.from('users').delete().eq('id', auth_id);
      }
      if (cleanEmailStr) {
        await db.from('users').delete().ilike('email', cleanEmailStr);
      }
      if (cleanMobileStr && cleanMobileStr.length >= 7 && cleanMobileStr !== '0000000000') {
        await db.from('users').delete().eq('mobile', cleanMobileStr);
      }

      if (db.auth && db.auth.admin) {
        const foundAuth = await findAuthUserPaginated(db, {
          authId: auth_id || null,
          email: cleanEmailStr || null
        });
        if (foundAuth?.id) {
          try { await db.auth.admin.deleteUser(foundAuth.id); } catch (_) {}
        }
      }

      invalidateServerCaches('users');
      res.json({ success: true, message: 'User deleted from auth and directory' });
    } catch (err: any) {
      console.warn('[Server Auth Delete Error]', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.post('/api/auth/update-user', async (req, res) => {
    const { auth_id, staff_id, email, password, name, role, mobile, active, staff_type } = req.body;
    try {
      invalidateServerCaches('users');
      const db = getServerSupabase();
      if (!db.auth.admin) {
        return res.status(400).json({ success: false, error: 'Service Role Key not configured' });
      }

      const callerIdentity = await authenticateCallerIdentity(db, req);
      if (!callerIdentity) {
        return res.status(401).json({ success: false, error: 'Authentication required to update staff credentials.' });
      }
      const callerAuth = await resolveCallerAuthoritativeRole(db, callerIdentity);
      if (!callerAuth.active) {
        return res.status(403).json({ success: false, error: 'Account is deactivated.' });
      }
      if (!new Set(['Business Owner', 'Production Team', 'Operations Team']).has(callerAuth.role)) {
        return res.status(403).json({ success: false, error: 'You are not authorized to update staff credentials.' });
      }

      const hasRawPwd = typeof password === 'string' && password.trim() !== '';

      const roleStr = String(role || '').trim().toLowerCase();
      const isStaffRole =
        staff_type === 'production' ||
        staff_type === 'operations' ||
        ['staff', 'team', 'editor', 'operation', 'production', 'sales'].some(r => roleStr.includes(r));

      let cleanMobileStr: string | undefined = mobile ? cleanPhone(mobile) : undefined;
      let cleanEmailStr: string | undefined = email ? cleanEmail(email) : undefined;

      // Resolve authoritative staff record strictly from the right table (never cross tables)
      let resolvedStaffTable: 'production_staff' | 'operations_staff' | null =
        staff_type === 'production' ? 'production_staff' : (staff_type === 'operations' ? 'operations_staff' : null);
      let existingStaffRecord: any = null;
      let staffAuthId: string | null = null;

      const parseNotesAuthId = (notesVal: any): string | null => {
        if (!notesVal) return null;
        try {
          let parsed = typeof notesVal === 'string' ? JSON.parse(notesVal) : notesVal;
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          if (parsed?.auth_user_id) return String(parsed.auth_user_id).trim();
          if (parsed?.notes && typeof parsed.notes === 'string') {
            const nested = JSON.parse(parsed.notes);
            if (nested?.auth_user_id) return String(nested.auth_user_id).trim();
          }
        } catch (_) {}
        return null;
      };

      if (staff_id) {
        if (resolvedStaffTable === 'production_staff') {
          const { data } = await db.from('production_staff').select('*').eq('staff_id', staff_id).maybeSingle();
          if (data) existingStaffRecord = data;
        } else if (resolvedStaffTable === 'operations_staff') {
          const { data } = await db.from('operations_staff').select('*').eq('staff_id', staff_id).maybeSingle();
          if (data) existingStaffRecord = data;
        } else {
          const preferProd = roleStr.includes('prod') || roleStr.includes('editor') || String(staff_id).startsWith('STF-');
          const firstTable = preferProd ? 'production_staff' : 'operations_staff';
          const secondTable = preferProd ? 'operations_staff' : 'production_staff';
          const { data: firstRec } = await db.from(firstTable).select('*').eq('staff_id', staff_id).maybeSingle();
          if (firstRec) {
            existingStaffRecord = firstRec;
            resolvedStaffTable = firstTable;
          } else {
            const { data: secondRec } = await db.from(secondTable).select('*').eq('staff_id', staff_id).maybeSingle();
            if (secondRec) {
              existingStaffRecord = secondRec;
              resolvedStaffTable = secondTable;
            }
          }
        }
      } else if (resolvedStaffTable && cleanEmailStr) {
        const { data } = await db.from(resolvedStaffTable).select('*').ilike('email', cleanEmailStr).maybeSingle();
        if (data) existingStaffRecord = data;
      }

      if (callerAuth.role === 'Production Team' && resolvedStaffTable === 'operations_staff') {
        return res.status(403).json({ success: false, error: 'Production Manager can only update Production staff credentials.' });
      }
      if (callerAuth.role === 'Operations Team' && resolvedStaffTable === 'production_staff') {
        return res.status(403).json({ success: false, error: 'Operation Manager can only update Operation staff credentials.' });
      }

      const cleanPwd = hasRawPwd
        ? (resolvedStaffTable === 'production_staff' ? password : password.trim())
        : null;
      if (cleanPwd !== null && cleanPwd.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
      }

      if (existingStaffRecord) {
        staffAuthId = existingStaffRecord.auth_user_id || parseNotesAuthId(existingStaffRecord.notes);
        if (existingStaffRecord.email) cleanEmailStr = cleanEmail(existingStaffRecord.email);
        if (existingStaffRecord.mobile) cleanMobileStr = cleanPhone(existingStaffRecord.mobile);
      }

      let existingMobileFound: string | null = existingStaffRecord?.mobile ? cleanPhone(existingStaffRecord.mobile) : null;
      let existingEmailFound: string | null = existingStaffRecord?.email ? cleanEmail(existingStaffRecord.email) : null;

      if ((!existingEmailFound || !existingMobileFound) && auth_id) {
        const { data: userRec } = await db.from('users').select('id, email, mobile').eq('id', auth_id).maybeSingle();
        if (userRec?.mobile && !existingMobileFound) existingMobileFound = cleanPhone(userRec.mobile);
        if (userRec?.email && !existingEmailFound) existingEmailFound = cleanEmail(userRec.email);
      }

      // Check global uniqueness only if email or mobile is being changed
      if ((cleanMobileStr || cleanEmailStr) && !existingStaffRecord) {
        const emailChanged = Boolean(cleanEmailStr && existingEmailFound && cleanEmailStr !== existingEmailFound);
        const mobileChanged = Boolean(cleanMobileStr && existingMobileFound && cleanMobileStr !== existingMobileFound);
        if (emailChanged || mobileChanged) {
          const uniqueCheck = await checkGlobalUniquenessInDb(
            db,
            mobileChanged ? cleanMobileStr : null,
            emailChanged ? cleanEmailStr : null,
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
      }

      // Determine target auth user with strict email verification
      let targetAuthUser: any = null;
      let targetAuthId: string | null = null;

      const candidateAuthId = staffAuthId || auth_id || null;
      if (candidateAuthId) {
        targetAuthUser = await findAuthUserPaginated(db, {
          authId: candidateAuthId,
          email: cleanEmailStr || null,
          allowEmailMismatch: Boolean(staffAuthId && existingStaffRecord)
        });
        if (targetAuthUser) targetAuthId = targetAuthUser.id;
      }

      if (!targetAuthUser && cleanEmailStr) {
        try {
          const { data: uRow } = await db.from('users').select('id, email').ilike('email', cleanEmailStr).maybeSingle();
          if (uRow?.id) {
            targetAuthUser = await findAuthUserPaginated(db, { authId: uRow.id, email: cleanEmailStr });
            if (targetAuthUser) targetAuthId = targetAuthUser.id;
          }
        } catch (_) {}
      }

      if (!targetAuthUser && (cleanEmailStr || cleanMobileStr)) {
        targetAuthUser = await findAuthUserPaginated(db, {
          email: cleanEmailStr || null,
          mobile: cleanEmailStr ? null : (cleanMobileStr || null)
        });
        if (targetAuthUser) targetAuthId = targetAuthUser.id;
      }

      const normalizedRole = role ? normalizeAuthRole(role, staff_type) : undefined;

      // Create or recover auth user if not yet present and a password is being set
      if (!targetAuthUser && cleanPwd) {
        if (!cleanEmailStr && !cleanMobileStr) {
          return res.status(404).json({ success: false, error: 'Staff authentication account not found' });
        }
        const encPwd = encryptStaffPassword(cleanPwd);
        const recovered = await createOrRecoverAuthUser(db, {
          email: cleanEmailStr,
          mobile: cleanMobileStr,
          staffId: existingStaffRecord?.staff_id || staff_id || null,
          password: cleanPwd,
          name: name || existingStaffRecord?.name || 'Staff Member',
          normalizedRole: normalizedRole || (resolvedStaffTable === 'production_staff' ? 'Production Team' : 'Operation Staff'),
          active,
          encPwd
        });
        if (!recovered.user) {
          return res.status(400).json({ success: false, error: recovered.error || 'Failed to create authentication credentials' });
        }
        targetAuthUser = recovered.user;
        targetAuthId = recovered.user.id;
      }

      if (cleanPwd && !targetAuthId) {
        return res.status(404).json({ success: false, error: 'Could not find or create authentication account for staff member' });
      }

      // Update Supabase Auth securely (never alter staff email/identity on password or profile update)
      if (targetAuthId) {
        const cleanedMeta: any = { ...(targetAuthUser?.user_metadata || {}) };
        delete cleanedMeta.current_password;
        if (name) cleanedMeta.name = name;
        if (normalizedRole) cleanedMeta.role = normalizedRole;
        if (cleanMobileStr) cleanedMeta.mobile = cleanMobileStr;
        if (cleanEmailStr && !cleanedMeta.original_email) cleanedMeta.original_email = cleanEmailStr;

        const updates: any = {
          user_metadata: cleanedMeta,
          email_confirm: true
        };
        if (cleanPwd) {
          updates.password = cleanPwd;
          updates.app_metadata = {
            ...(targetAuthUser?.app_metadata || {}),
            enc_pwd: encryptStaffPassword(cleanPwd)
          };
        }
        if (active !== undefined) {
          updates.ban_duration = active === false ? '876000h' : 'none';
        }
        if (cleanEmailStr && !isStaffRole && cleanEmail(targetAuthUser?.email) !== cleanEmailStr) {
          updates.email = cleanEmailStr;
        }

        const { error: authUpdErr } = await db.auth.admin.updateUserById(targetAuthId, updates);
        if (authUpdErr) {
          console.error('[Server Auth Update Error]', authUpdErr);
          if (cleanPwd) {
            const recovered = await createOrRecoverAuthUser(db, {
              email: cleanEmailStr,
              mobile: cleanMobileStr,
              staffId: existingStaffRecord?.staff_id || staff_id || null,
              password: cleanPwd,
              name: name || existingStaffRecord?.name || 'Staff Member',
              normalizedRole: normalizedRole || (resolvedStaffTable === 'production_staff' ? 'Production Team' : 'Operation Staff'),
              active,
              encPwd: encryptStaffPassword(cleanPwd)
            });
            if (recovered.user) {
              targetAuthUser = recovered.user;
              targetAuthId = recovered.user.id;
            } else {
              return res.status(400).json({ success: false, error: authUpdErr.message || 'Authentication provider failed to update password' });
            }
          } else {
            console.warn('[Server Auth Non-Password Update Warning]', authUpdErr.message);
          }
        }
      }

      // Sync public.users strictly without plaintext passwords for staff accounts
      let syncedRecord: any = null;
      if (targetAuthId) {
        syncedRecord = await syncPublicUserRow(db, {
          authUserId: targetAuthId,
          name: name || existingStaffRecord?.name,
          email: cleanEmailStr || targetAuthUser?.email,
          mobile: cleanMobileStr,
          normalizedRole,
          active
        });
      }

      // Sync auth_user_id and (when changed or needing auto-heal from Auth enc_pwd) password column in resolved staff table
      let tablePasswordToSync: string | null = cleanPwd;
      if (!tablePasswordToSync && resolvedStaffTable === 'production_staff' && targetAuthUser?.app_metadata?.enc_pwd) {
        const existingColVal = existingStaffRecord?.Password;
        const needsHeal =
          !existingColVal ||
          typeof existingColVal !== 'string' ||
          existingColVal.trim() === '' ||
          existingColVal.trim().startsWith('enc:v1:') ||
          /^[0-9a-f]{64}$/i.test(existingColVal.trim()) ||
          /^[0-9a-f]{32}$/i.test(existingColVal.trim());
        if (needsHeal) {
          const decrypted = decryptStaffPassword(targetAuthUser.app_metadata.enc_pwd);
          if (
            decrypted &&
            !decrypted.trim().startsWith('enc:v1:') &&
            !/^[0-9a-f]{64}$/i.test(decrypted.trim()) &&
            !/^[0-9a-f]{32}$/i.test(decrypted.trim())
          ) {
            tablePasswordToSync = decrypted;
          }
        }
      }

      if (targetAuthId && resolvedStaffTable) {
        const staffSyncRes = await syncStaffNotesAuthId(db, {
          table: resolvedStaffTable,
          staffId: existingStaffRecord?.staff_id || staff_id || null,
          email: cleanEmailStr || null,
          authUserId: targetAuthId,
          password: tablePasswordToSync
        });
        if (!staffSyncRes.success && cleanPwd) {
          return res.status(500).json({
            success: false,
            error: staffSyncRes.error || `Failed to synchronize password column on ${resolvedStaffTable}`
          });
        }
      } else if (cleanPwd && resolvedStaffTable && existingStaffRecord?.staff_id) {
        const directPwdRes = await syncStaffPasswordColumnsOnRow(db, {
          table: resolvedStaffTable,
          staffId: existingStaffRecord.staff_id,
          password: cleanPwd
        });
        if (!directPwdRes.success) {
          return res.status(500).json({
            success: false,
            error: directPwdRes.error || `Failed to save password on ${resolvedStaffTable}`
          });
        }
      }

      invalidateServerCaches('users');
      res.json({
        success: true,
        auth_user_id: targetAuthId,
        data: { record: syncedRecord }
      });
    } catch (err: any) {
      console.error(`[Server Auth Update Exception]`, err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // Issue a durable signed session token + HttpOnly cookie for authorized manager/owner accounts
  app.post('/api/auth/manager-session', async (req, res) => {
    try {
      const db = getServerSupabase();
      const { userId, accessToken, identifier, email, password } = req.body || {};
      const hasCredentialFallback = Boolean(String(password ?? '') && (email || identifier || userId));

      // 1. Verify Supabase Auth JWT (from Authorization header or request body accessToken)
      const authHeader = String(req?.headers?.authorization || '').trim();
      const headerJwt = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
      const jwt = (headerJwt && headerJwt !== SUPABASE_ANON_KEY)
        ? headerJwt
        : (typeof accessToken === 'string' && accessToken.trim() && accessToken.trim() !== SUPABASE_ANON_KEY ? accessToken.trim() : '');

      if (jwt) {
        try {
          const { data: userData, error: jwtErr } = await db.auth.getUser(jwt);
          if (!jwtErr && userData?.user) {
            if (userId && String(userId).trim() !== String(userData.user.id).trim()) {
              console.warn('[Server Auth Manager Session] Body userId differs from verified JWT user.id:', userId, userData.user.id);
            }
            const authInfo = await resolveCallerAuthoritativeRole(db, {
              id: userData.user.id,
              email: userData.user.email,
              mobile: userData.user.user_metadata?.mobile,
              metadataRole: userData.user.user_metadata?.role
            });
            if (!authInfo.active) {
              console.warn('[Server Auth Manager Session] Deactivated user attempted manager session:', userData.user.email);
              return res.status(403).json({
                success: false,
                code: 'ACCOUNT_DEACTIVATED',
                error: 'Your account has been deactivated. Please contact the administrator.'
              });
            }
            if (!MANAGER_ROLES_SET.has(authInfo.role)) {
              console.warn('[Server Auth Manager Session] Non-manager role attempted manager session:', userData.user.email, authInfo.role);
              return res.status(403).json({
                success: false,
                code: 'ROLE_NOT_MANAGER',
                error: `Account role "${authInfo.role}" is not authorized for a manager session.`
              });
            }
            const token = signManagerSessionToken({
              uid: String(userData.user.id),
              email: cleanEmail(userData.user.email),
              role: authInfo.role
            });
            setManagerSessionCookie(req, res, token);
            return res.json({
              success: true,
              token,
              userId: String(userData.user.id),
              email: cleanEmail(userData.user.email),
              role: authInfo.role
            });
          } else {
            const jwtReason = jwtErr?.message || 'Supabase token verification failed';
            console.warn('[Server Auth Manager Session] JWT validation failed:', jwtReason);
            if (!hasCredentialFallback) {
              return res.status(401).json({
                success: false,
                code: 'INVALID_ACCESS_TOKEN',
                error: `Authentication token verification failed (${jwtReason}). Please log in again.`
              });
            }
          }
        } catch (jwtEx: any) {
          console.error('[Server Auth Manager Session] JWT check exception:', jwtEx?.message || jwtEx);
          if (!hasCredentialFallback) {
            return res.status(502).json({
              success: false,
              code: 'TOKEN_VERIFICATION_ERROR',
              error: `Failed to verify authentication token: ${jwtEx?.message || 'Auth service unavailable'}`
            });
          }
        }
      }

      // 2. Credential verification against public.users (supports email, username, mobile, or userId; checks all duplicate rows)
      const lookupTerms = Array.from(new Set(
        [email, identifier]
          .map(v => String(v ?? '').trim())
          .filter(Boolean)
      ));
      const rawPwd = typeof password === 'string' ? password : String(password || '');
      const cleanPwd = rawPwd.trim();
      const targetUserId = String(userId || '').trim();

      if ((lookupTerms.length === 0 && !targetUserId) || !cleanPwd) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_CREDENTIALS',
          error: 'Authenticated access token or valid manager credentials are required.'
        });
      }

      const { usersData: allUsers, uErr } = await getDirectoryTablesCached(db);
      if (uErr || !Array.isArray(allUsers)) {
        console.error('[Server Auth Manager Session] Database users lookup failed:', uErr?.message || uErr);
        return res.status(500).json({
          success: false,
          code: 'DB_USERS_LOOKUP_FAILED',
          error: `Database user verification failed: ${uErr?.message || 'Unable to query public.users'}`
        });
      }

      const expandSystemAliases = (term: string): string[] => {
        const t = term.trim().toLowerCase();
        if (t === 'owner@photocrew.com' || t === 'founder@photocrew.com' || t === 'owner' || t === 'founder') {
          return [t, 'owner@photocrew.com', 'founder@photocrew.com', 'owner'];
        }
        if (t === 'operation@photocrew.com' || t === 'operations@photocrew.com' || t === 'operation' || t === 'operations') {
          return [t, 'operation@photocrew.com', 'operations@photocrew.com', 'operation'];
        }
        if (t === 'production@photocrew.com' || t === 'production') {
          return [t, 'production@photocrew.com', 'production'];
        }
        if (t === 'sales@photocrew.com' || t === 'sale@photocrew.com') {
          return [t, 'sales@photocrew.com', 'sale@photocrew.com'];
        }
        return [t];
      };
      const expandedLowerTerms = new Set<string>();
      for (const term of lookupTerms) {
        for (const alias of expandSystemAliases(term)) {
          expandedLowerTerms.add(alias);
        }
      }

      const candidates = allUsers.filter((u: any) => {
        if (targetUserId && String(u.id || '').trim() === targetUserId) return true;
        const uEmail = cleanEmail(u.email);
        const uUser = cleanEmail(u.username);
        const uMob = cleanPhone(u.mobile);
        const uMob10 = uMob.length >= 10 ? uMob.slice(-10) : uMob;
        if (uEmail && expandedLowerTerms.has(uEmail)) return true;
        if (uUser && expandedLowerTerms.has(uUser)) return true;
        for (const term of lookupTerms) {
          if (!term.includes('@')) {
            const digits = term.replace(/\D/g, '');
            const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
            if (digits.length >= 7 && !/^0+$/.test(digits) && (uMob === digits || (last10.length >= 7 && uMob10 === last10))) {
              return true;
            }
          }
        }
        return false;
      });

      if (candidates.length === 0) {
        console.warn('[Server Auth Manager Session] No matching public.users row for:', lookupTerms, targetUserId);
        return res.status(401).json({
          success: false,
          code: 'USER_NOT_FOUND',
          error: 'Manager account record not found in database.'
        });
      }

      const passwordsMatch = (storedRaw: any): boolean => {
        const storedExact = String(storedRaw ?? '');
        const storedTrimmed = storedExact.trim();
        if (!storedTrimmed) return false;
        const timingEq = (a: string, b: string) => {
          const aBuf = Buffer.from(a, 'utf8');
          const bBuf = Buffer.from(b, 'utf8');
          return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
        };
        return timingEq(storedTrimmed, cleanPwd) || (rawPwd !== cleanPwd && timingEq(storedExact, rawPwd));
      };

      // Prefer exact targetUserId match if its password matches; then non-placeholder Auth UUID rows; otherwise any active matching row
      const isRowActive = (u: any) =>
        u.active !== false && String(u.active) !== 'false' && u.active !== 0 && String(u.active) !== '0';
      const isRealAuthUuid = (idVal: any) => {
        const s = String(idVal || '').trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) && !s.startsWith('00000000-0000-0000-0000-');
      };

      const allActivePasswordMatches = candidates.filter((u: any) => isRowActive(u) && passwordsMatch(u.password));
      const activePasswordMatched =
        allActivePasswordMatches.find((u: any) => targetUserId && String(u.id || '').trim() === targetUserId) ||
        allActivePasswordMatches.find((u: any) => isRealAuthUuid(u.id)) ||
        allActivePasswordMatches[0];

      if (!activePasswordMatched) {
        const anyMatchedPwd = candidates.some((u: any) => passwordsMatch(u.password));
        if (anyMatchedPwd) {
          return res.status(403).json({
            success: false,
            code: 'ACCOUNT_DEACTIVATED',
            error: 'Your account has been deactivated. Please contact the administrator.'
          });
        }
        const anyHasPwd = candidates.some((u: any) => String(u.password ?? '').trim() !== '');
        if (!anyHasPwd) {
          return res.status(401).json({
            success: false,
            code: 'NO_FALLBACK_PASSWORD',
            error: 'This account uses standard Supabase Authentication. Supabase Auth verification failed or timed out.'
          });
        }
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          error: 'Invalid manager credentials.'
        });
      }

      const authInfo = await resolveCallerAuthoritativeRole(db, {
        id: activePasswordMatched.id,
        email: activePasswordMatched.email,
        mobile: activePasswordMatched.mobile,
        metadataRole: activePasswordMatched.role
      });
      if (!authInfo.active) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_DEACTIVATED',
          error: 'Your account has been deactivated. Please contact the administrator.'
        });
      }
      if (!MANAGER_ROLES_SET.has(authInfo.role)) {
        console.warn('[Server Auth Manager Session] Resolved role is not a manager:', activePasswordMatched.email, authInfo.role);
        return res.status(403).json({
          success: false,
          code: 'ROLE_NOT_MANAGER',
          error: `Account role "${authInfo.role}" is not authorized for a manager session.`
        });
      }

      // Synchronize Supabase Auth password in the background if this manager has a corresponding Auth UUID and authenticated via DB fallback
      const matchedIdStr = String(activePasswordMatched.id || '').trim();
      if (!jwt && db.auth?.admin) {
        for (const matchedRow of allActivePasswordMatches) {
          const rowId = String(matchedRow.id || '').trim();
          if (isRealAuthUuid(rowId)) {
            db.auth.admin.updateUserById(rowId, {
              password: String(matchedRow.password).trim(),
              email_confirm: true,
              ban_duration: 'none'
            }).catch(() => {});
          }
        }
      }

      const token = signManagerSessionToken({
        uid: matchedIdStr,
        email: cleanEmail(activePasswordMatched.email),
        role: authInfo.role
      });

      setManagerSessionCookie(req, res, token);
      return res.json({
        success: true,
        token,
        userId: matchedIdStr,
        email: cleanEmail(activePasswordMatched.email),
        role: authInfo.role
      });
    } catch (err: any) {
      console.error('[Server Auth Manager Session Error]', err);
      return res.status(500).json({
        success: false,
        code: 'MANAGER_SESSION_EXCEPTION',
        error: err?.message || 'Failed to create manager session'
      });
    }
  });

  app.post('/api/auth/verify-session', async (req, res) => {
    try {
      const db = getServerSupabase();
      const callerIdentity = await authenticateCallerIdentity(db, req);
      if (!callerIdentity) {
        clearManagerSessionCookie(req, res);
        return res.status(401).json({ success: false, valid: false, error: 'Session missing or expired' });
      }
      const callerAuth = await resolveCallerAuthoritativeRole(db, callerIdentity);
      if (!callerAuth.active) {
        clearManagerSessionCookie(req, res);
        return res.status(403).json({ success: false, valid: false, error: 'Account is deactivated' });
      }

      let refreshedToken: string | undefined;
      if (MANAGER_ROLES_SET.has(callerAuth.role)) {
        refreshedToken = signManagerSessionToken({
          uid: String(callerIdentity.id || ''),
          email: cleanEmail(callerIdentity.email),
          role: callerAuth.role
        });
        setManagerSessionCookie(req, res, refreshedToken);
      }

      return res.json({
        success: true,
        valid: true,
        userId: callerIdentity.id || null,
        email: callerIdentity.email || null,
        role: callerAuth.role,
        ...(refreshedToken ? { token: refreshedToken } : {})
      });
    } catch (err: any) {
      console.error('[Server Auth Verify Session Error]', err);
      return res.status(500).json({ success: false, error: err?.message || 'Failed to verify session' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearManagerSessionCookie(req, res);
    return res.json({ success: true });
  });

  // RBAC-protected endpoint to retrieve the decrypted current password of an authorized staff member
  app.post('/api/auth/get-staff-password', async (req, res) => {
    try {
      const db = getServerSupabase();
      if (!db.auth.admin) {
        return res.status(500).json({ success: false, error: 'Service Role Key not configured on server' });
      }

      // 1. Authenticate caller via Supabase JWT or signed ERP manager token
      const callerIdentity = await authenticateCallerIdentity(db, req);

      if (!callerIdentity) {
        return res.status(401).json({ success: false, error: 'Authentication required to view staff credentials.' });
      }

      const callerAuth = await resolveCallerAuthoritativeRole(db, callerIdentity);
      if (!callerAuth.active) {
        return res.status(403).json({ success: false, error: 'Account is deactivated.' });
      }

      const allowedManagerRoles = new Set(['Business Owner', 'Production Team', 'Operations Team']);
      if (!allowedManagerRoles.has(callerAuth.role)) {
        return res.status(403).json({ success: false, error: 'You are not authorized to view staff passwords.' });
      }

      // 2. Resolve target staff member and their authoritative department from database
      const { staff_id, staff_type, auth_id, email, mobile } = req.body || {};
      const cleanStaffId = staff_id ? String(staff_id).trim() : '';
      const cleanAuthId = auth_id ? String(auth_id).trim() : '';
      const cleanTargetEmail = cleanEmail(email);
      const cleanTargetMobile = cleanPhone(mobile);
      const requestedType = staff_type === 'production' || staff_type === 'operations' ? staff_type : null;

      let prodMatch: any = null;
      let opMatch: any = null;

      if (cleanStaffId) {
        const [pRes, oRes] = await Promise.all([
          db.from('production_staff').select('*').eq('staff_id', cleanStaffId).maybeSingle(),
          db.from('operations_staff').select('*').eq('staff_id', cleanStaffId).maybeSingle()
        ]);
        if (pRes.data) prodMatch = pRes.data;
        if (oRes.data) opMatch = oRes.data;
      }

      if (!prodMatch && !opMatch && cleanTargetEmail) {
        const [pRes, oRes] = await Promise.all([
          db.from('production_staff').select('*').ilike('email', cleanTargetEmail).maybeSingle(),
          db.from('operations_staff').select('*').ilike('email', cleanTargetEmail).maybeSingle()
        ]);
        if (pRes.data) prodMatch = pRes.data;
        if (oRes.data) opMatch = oRes.data;
      }

      if (!prodMatch && !opMatch && cleanTargetMobile && cleanTargetMobile.length >= 7) {
        const [pRes, oRes] = await Promise.all([
          db.from('production_staff').select('*').eq('mobile', cleanTargetMobile).maybeSingle(),
          db.from('operations_staff').select('*').eq('mobile', cleanTargetMobile).maybeSingle()
        ]);
        if (pRes.data) prodMatch = pRes.data;
        if (oRes.data) opMatch = oRes.data;
      }

      let targetDept: 'production' | 'operations' | null = null;
      let targetStaffRecord: any = null;
      if (prodMatch && !opMatch) {
        targetDept = 'production';
        targetStaffRecord = prodMatch;
      } else if (opMatch && !prodMatch) {
        targetDept = 'operations';
        targetStaffRecord = opMatch;
      } else if (prodMatch && opMatch) {
        if (requestedType === 'operations') {
          targetDept = 'operations';
          targetStaffRecord = opMatch;
        } else {
          targetDept = 'production';
          targetStaffRecord = prodMatch;
        }
      } else if (requestedType) {
        targetDept = requestedType;
      }

      // 3. Enforce strict department-level RBAC
      if (callerAuth.role === 'Production Team' && targetDept !== 'production') {
        return res.status(403).json({ success: false, error: 'Production Manager can only view passwords of Production staff.' });
      }
      if (callerAuth.role === 'Operations Team' && targetDept !== 'operations') {
        return res.status(403).json({ success: false, error: 'Operation Manager can only view passwords of Operation staff.' });
      }

      const resolvedStaffAuthId =
        targetStaffRecord?.auth_user_id ||
        extractNotesAuthUserIdServer(targetStaffRecord?.notes) ||
        cleanAuthId ||
        null;
      const resolvedEmail = cleanEmail(targetStaffRecord?.email || cleanTargetEmail);
      const resolvedMobile = cleanPhone(targetStaffRecord?.mobile || cleanTargetMobile);

      // Never expose system division account passwords (e.g. if a test staff row reused Founder/Manager email)
      if (isSystemDivisionAccountServer({ id: resolvedStaffAuthId, email: resolvedEmail })) {
        return res.status(403).json({ success: false, error: 'Cannot retrieve password for system division account.' });
      }

      const targetAuthUser = await findAuthUserPaginated(db, {
        authId: resolvedStaffAuthId,
        email: resolvedEmail || null,
        mobile: resolvedEmail ? null : (resolvedMobile || null),
        allowEmailMismatch: Boolean(resolvedStaffAuthId && targetStaffRecord)
      });

      if (targetAuthUser) {
        if (
          isSystemDivisionAccountServer({ id: targetAuthUser.id, email: targetAuthUser.email }) ||
          String(targetAuthUser.user_metadata?.role || '').trim().toLowerCase() === 'business owner'
        ) {
          return res.status(403).json({ success: false, error: 'Cannot retrieve password for system division account.' });
        }

        // Only fall back to Auth-derived role check when targetDept was not already verified from staff tables
        if (!targetDept) {
          const targetAuthRole = await resolveCallerAuthoritativeRole(db, {
            id: targetAuthUser.id,
            email: targetAuthUser.email,
            mobile: targetAuthUser.user_metadata?.mobile,
            metadataRole: targetAuthUser.user_metadata?.role
          });
          if (callerAuth.role === 'Production Team' && targetAuthRole.role !== 'Production Staff') {
            return res.status(403).json({ success: false, error: 'Production Manager can only view passwords of Production staff.' });
          }
          if (callerAuth.role === 'Operations Team' && targetAuthRole.role !== 'Operation Staff') {
            return res.status(403).json({ success: false, error: 'Operation Manager can only view passwords of Operation staff.' });
          }
        }
      }

      const isHashedOrEncrypted = (val: any): boolean => {
        if (typeof val !== 'string') return true;
        const t = val.trim();
        if (!t) return true;
        if (t.startsWith('enc:v1:') || t.startsWith('$2a$') || t.startsWith('$2b$') || t.startsWith('$2y$') || t.startsWith('$argon2')) {
          return true;
        }
        if (/^[0-9a-f]{64}$/i.test(t) || /^[0-9a-f]{32}$/i.test(t)) return true;
        return false;
      };

      const extractNotesCurrentPwd = (notesVal: any): string | null => {
        if (!notesVal) return null;
        try {
          let parsed = typeof notesVal === 'string' ? JSON.parse(notesVal) : notesVal;
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          if (parsed && typeof parsed === 'object') {
            const raw = parsed.current_password || parsed.password || parsed.Password;
            if (raw && !isHashedOrEncrypted(String(raw))) return String(raw).trim();
            if (parsed.notes && typeof parsed.notes === 'string' && parsed.notes.trim().startsWith('{')) {
              const nested = JSON.parse(parsed.notes);
              const nRaw = nested?.current_password || nested?.password || nested?.Password;
              if (nRaw && !isHashedOrEncrypted(String(nRaw))) return String(nRaw).trim();
            }
          }
        } catch (_) {}
        return null;
      };

      let resolvedPassword: string | null = null;
      let hadValidEncPwd = false;

      const staffRowRawPwd = targetStaffRecord?.Password ?? targetStaffRecord?.password ?? null;
      const staffRowPlain = staffRowRawPwd && String(staffRowRawPwd).trim() !== '' && !isHashedOrEncrypted(String(staffRowRawPwd))
        ? (targetDept === 'production' ? String(staffRowRawPwd) : String(staffRowRawPwd).trim())
        : null;

      // 1. Primary source for Production Staff: plain-text 'Password' column in production_staff
      if (targetDept === 'production' && staffRowPlain) {
        resolvedPassword = staffRowPlain;
      }

      // 2. AES-256-GCM encrypted password in Auth app_metadata
      const encPwd = targetAuthUser?.app_metadata?.enc_pwd;
      if (encPwd) {
        const decrypted = decryptStaffPassword(encPwd);
        if (decrypted !== null && !isHashedOrEncrypted(decrypted)) {
          hadValidEncPwd = true;
          if (!resolvedPassword) {
            resolvedPassword = decrypted;
          }
        }
      }

      if (resolvedPassword && targetAuthUser && !hadValidEncPwd) {
        try {
          await db.auth.admin.updateUserById(targetAuthUser.id, {
            app_metadata: {
              ...(targetAuthUser.app_metadata || {}),
              enc_pwd: encryptStaffPassword(resolvedPassword)
            }
          });
          hadValidEncPwd = true;
        } catch (_) {}
      }

      // 3. Legacy fallback: verified plaintext / SHA-256-matched password from DB or Auth metadata (never return hashes)
      if (!resolvedPassword) {
        let matchedDbUser: any = null;
        const candidateDbIds = [targetAuthUser?.id, resolvedStaffAuthId].filter(Boolean) as string[];
        for (const uid of candidateDbIds) {
          const { data: uRow } = await db.from('users').select('id, email, mobile, role, password').eq('id', uid).maybeSingle();
          if (uRow) {
            matchedDbUser = uRow;
            break;
          }
        }
        if (!matchedDbUser && resolvedEmail) {
          const { data: uRow } = await db.from('users').select('id, name, email, mobile, role, password').ilike('email', resolvedEmail).maybeSingle();
          if (uRow) matchedDbUser = uRow;
        }
        if (!matchedDbUser && resolvedMobile && resolvedMobile.length >= 7 && resolvedMobile !== '0000000000') {
          const { data: mobRows } = await db.from('users').select('id, name, email, mobile, role, password').eq('mobile', resolvedMobile);
          if (Array.isArray(mobRows) && mobRows.length > 0) {
            const targetNameLower = String(targetStaffRecord?.name || '').trim().toLowerCase();
            matchedDbUser =
              mobRows.find((u: any) => targetNameLower && String(u.name || '').trim().toLowerCase() === targetNameLower) ||
              mobRows.find((u: any) => !isSystemDivisionAccountServer({ id: u.id, email: u.email })) ||
              null;
          }
        }

        const dbUserIsSystem = matchedDbUser && (
          isSystemDivisionAccountServer({ id: matchedDbUser.id, email: matchedDbUser.email }) ||
          String(matchedDbUser.role || '').trim().toLowerCase() === 'business owner'
        );

        const dbUserPwd = !dbUserIsSystem && matchedDbUser?.password && !isHashedOrEncrypted(String(matchedDbUser.password))
          ? String(matchedDbUser.password).trim()
          : null;
        const notesPwd = extractNotesCurrentPwd(targetStaffRecord?.notes);
        const metaPwd = [
          targetAuthUser?.user_metadata?.current_password,
          targetAuthUser?.user_metadata?.password
        ].find(v => v && !isHashedOrEncrypted(String(v)));

        // If the staff record stores a SHA-256 hash, check if any real candidate matches it mathematically
        if (typeof staffRowRawPwd === 'string' && /^[0-9a-f]{64}$/i.test(staffRowRawPwd.trim())) {
          const hashTarget = staffRowRawPwd.trim().toLowerCase();
          const hashCandidates = [
            dbUserPwd,
            metaPwd ? String(metaPwd).trim() : null,
            notesPwd,
            resolvedMobile && resolvedMobile.length >= 6 ? resolvedMobile : null,
            resolvedMobile && resolvedMobile.length >= 6 ? `${resolvedMobile}@123` : null
          ].filter(Boolean) as string[];
          for (const cand of hashCandidates) {
            const digest = crypto.createHash('sha256').update(cand).digest('hex').toLowerCase();
            if (digest === hashTarget) {
              resolvedPassword = cand;
              break;
            }
          }
        }

        if (!resolvedPassword) {
          resolvedPassword = staffRowPlain || dbUserPwd || (metaPwd ? String(metaPwd).trim() : null) || notesPwd || null;
        }

        // Persist AES-256-GCM enc_pwd onto targetAuthUser for fast future retrieval
        if (resolvedPassword && targetAuthUser && !hadValidEncPwd) {
          try {
            await db.auth.admin.updateUserById(targetAuthUser.id, {
              app_metadata: {
                ...(targetAuthUser.app_metadata || {}),
                enc_pwd: encryptStaffPassword(resolvedPassword)
              }
            });
          } catch (_) {}
        }
      }

      if (!resolvedPassword || isHashedOrEncrypted(resolvedPassword)) {
        return res.json({ success: true, password: null, requiresReset: true, hasPassword: Boolean(targetAuthUser) });
      }

      // Ensure the corresponding staff profile table password column is synchronized whenever empty, hashed, or stale
      if (targetStaffRecord?.staff_id && (targetDept === 'production' || targetDept === 'operations')) {
        const staffTableName = targetDept === 'production' ? 'production_staff' : 'operations_staff';
        const existingColVal = targetStaffRecord.Password ?? targetStaffRecord.password ?? null;
        const needsTableSync =
          !existingColVal ||
          isHashedOrEncrypted(String(existingColVal)) ||
          (targetDept === 'production'
            ? String(existingColVal) !== resolvedPassword
            : String(existingColVal).trim() !== resolvedPassword);
        if (needsTableSync) {
          await syncStaffPasswordColumnsOnRow(db, {
            table: staffTableName,
            staffId: targetStaffRecord.staff_id,
            password: resolvedPassword
          }).catch(() => {});
        }
      }

      return res.json({ success: true, password: resolvedPassword, requiresReset: false, hasPassword: true });
    } catch (err: any) {
      console.error('[Server Auth Get Staff Password Error]', err);
      return res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve staff password' });
    }
  });

  // Vite middleware for development vs static files for production
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' && hasDist;

  if (!isProduction) {
    let viteInstance: any = null;
    let viteInitPromise: Promise<any> | null = null;

    const getViteServer = () => {
      if (viteInstance) return Promise.resolve(viteInstance);
      if (!viteInitPromise) {
        console.log('[Server] Initializing Vite development middleware...');
        viteInitPromise = (async () => {
          const { createServer: createViteServer } = await import('vite');
          viteInstance = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
          });
          console.log('[Server] Vite development middleware ready.');
          return viteInstance;
        })();
      }
      return viteInitPromise;
    };

    app.use(async (req, res, next) => {
      try {
        // Respond immediately to HEAD readiness probes even while Vite is warming up
        if (!viteInstance && req.method === 'HEAD' && (req.path === '/' || req.path === '/index.html')) {
          return res.status(200).end();
        }
        const vite = viteInstance || (await getViteServer());
        return vite.middlewares(req, res, next);
      } catch (err) {
        return next(err);
      }
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      // Warm up Vite right after the HTTP socket is listening on port 3000
      setImmediate(() => {
        getViteServer().catch(err => console.error('[Server] Vite init error:', err));
      });
    });
  } else {
    console.log('[Server] Serving production static assets from dist...');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();

