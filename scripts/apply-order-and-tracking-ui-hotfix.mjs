import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Patch target not found: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Patch target is not unique: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replaceAllChecked(source, search, replacement, expected, label) {
  const pieces = source.split(search);
  const count = pieces.length - 1;
  if (count !== expected) throw new Error(`Expected ${expected} matches for ${label}, found ${count}`);
  return pieces.join(replacement);
}

// ---------------------------------------------------------------------------
// Protected + signed customer order links
// ---------------------------------------------------------------------------
{
  const path = 'netlify/functions/_shared/legacy/get-order.cjs';
  let source = read(path);
  source = replaceOnce(
    source,
    "const { getSession, unauthorized } = require('../server-auth.cjs');",
    "const { getSession, unauthorized } = require('../server-auth.cjs');\nconst { verifyOrderAccessToken } = require('../order-email-access.cjs');",
    'get-order access helper import',
  );
  source = replaceOnce(
    source,
    "  const session = getSession(event);\n  if (!session) return unauthorized();\n\n  if (event.httpMethod !== 'GET') {",
    "  const session = getSession(event);\n\n  if (event.httpMethod !== 'GET') {",
    'defer get-order authorization until order is loaded',
  );
  source = replaceOnce(
    source,
    "    const order = orderResult[0];\n    if (!session.admin && session.sub !== order.user_id) {\n      return unauthorized('Order ownership could not be verified');\n    }",
    "    const order = orderResult[0];\n    const emailAccessToken = event.queryStringParameters?.token || '';\n    const hasEmailAccess = verifyOrderAccessToken(emailAccessToken, order.id, order.email);\n    if (!session && !hasEmailAccess) {\n      return unauthorized('Sign in or verify the order email to view this order');\n    }\n    if (session && !session.admin && session.sub !== order.user_id && !hasEmailAccess) {\n      return unauthorized('Order ownership could not be verified');\n    }",
    'get-order signed access authorization',
  );
  write(path, source);
}

{
  const path = 'netlify/functions/_shared/legacy/notify-order.cjs';
  let source = read(path);
  source = replaceOnce(
    source,
    "const { neon } = require('@neondatabase/serverless');",
    "const { neon } = require('@neondatabase/serverless');\nconst { createOrderAccessToken } = require('../order-email-access.cjs');",
    'notify-order signed access import',
  );
  source = replaceOnce(
    source,
    "    // Build origin URL for order details link\n    const origin = event.headers['x-forwarded-host']\n      ? `https://${event.headers['x-forwarded-host']}`\n      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';\n\n    const invoiceUrl = `${origin}/orders/${resolvedOrderId}`;",
    "    // Customer emails get a signed direct-order link. Admin emails go to\n    // Admin Orders instead of the customer-only route. Prefer the canonical\n    // production origin so email links never point at a deploy preview or the\n    // legacy www origin with a separate browser-storage session.\n    const origin = String(process.env.PUBLIC_SITE_URL || process.env.URL || 'https://bannersonthefly.com').replace(/\\/$/, '');\n    const orderAccessToken = createOrderAccessToken(resolvedOrderId, order.email);\n    const customerInvoiceUrl = orderAccessToken\n      ? `${origin}/orders/${resolvedOrderId}?token=${encodeURIComponent(orderAccessToken)}`\n      : `${origin}/orders/${resolvedOrderId}`;\n    const adminInvoiceUrl = `${origin}/admin/orders?order=${encodeURIComponent(resolvedOrderId)}`;",
    'notify-order customer/admin link split',
  );
  source = replaceOnce(
    source,
    "      invoiceUrl\n    };",
    "      invoiceUrl: customerInvoiceUrl\n    };",
    'customer email signed invoice URL',
  );
  source = replaceOnce(
    source,
    "          invoiceUrl: emailPayload.invoiceUrl",
    "          invoiceUrl: adminInvoiceUrl",
    'admin email admin-order URL',
  );
  write(path, source);
}

// ---------------------------------------------------------------------------
// Customer order page: never hang blank; support old links via email verify
// ---------------------------------------------------------------------------
{
  const path = 'src/pages/OrderDetail.tsx';
  let source = read(path);
  source = replaceOnce(
    source,
    "import { useParams, useNavigate } from 'react-router-dom';",
    "import { useParams, useNavigate, useSearchParams } from 'react-router-dom';",
    'OrderDetail search params import',
  );
  source = replaceOnce(
    source,
    "  const { id } = useParams<{ id: string }>();\n  const navigate = useNavigate();\n  const { scrollToTop } = useScrollToTop();\n  const [order, setOrder] = useState<Order | null>(null);\n  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState<string | null>(null);",
    "  const { id } = useParams<{ id: string }>();\n  const navigate = useNavigate();\n  const [searchParams] = useSearchParams();\n  const accessToken = searchParams.get('token') || '';\n  const { scrollToTop } = useScrollToTop();\n  const [order, setOrder] = useState<Order | null>(null);\n  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState<string | null>(null);\n  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);\n  const [verificationEmail, setVerificationEmail] = useState('');\n  const [verifyingEmail, setVerifyingEmail] = useState(false);",
    'OrderDetail verification state',
  );
  source = replaceOnce(
    source,
    "    if (id) {\n      fetchOrder(id);\n    }\n  }, [id]);\n\n  const fetchOrder = async (orderId: string) => {\n    try {\n      setLoading(true);\n      const response = await fetch(`/.netlify/functions/get-order?id=${orderId}`, { headers: authorizedHeaders() });\n      const data = await response.json();\n      \n      if (data.ok && data.order) {\n        setOrder(data.order);\n      } else {\n        setError(data.error || 'Order not found');\n      }\n    } catch (err) {\n      setError('Failed to load order details');\n    } finally {\n      setLoading(false);\n    }\n  };",
    "    if (id) {\n      fetchOrder(id, accessToken);\n    }\n  }, [id, accessToken]);\n\n  const fetchOrder = async (orderId: string, token = '') => {\n    try {\n      setLoading(true);\n      setError(null);\n      const params = new URLSearchParams({ id: orderId });\n      if (token) params.set('token', token);\n      const response = await fetch(`/.netlify/functions/get-order?${params.toString()}`, { headers: authorizedHeaders() });\n      const data = await response.json().catch(() => ({}));\n\n      if (response.status === 401 || response.status === 403) {\n        setOrder(null);\n        setNeedsEmailVerification(true);\n        return;\n      }\n      if (!response.ok || !data.ok || !data.order) {\n        setOrder(null);\n        setError(data.error || `Unable to load order (HTTP ${response.status})`);\n        return;\n      }\n\n      setNeedsEmailVerification(false);\n      setOrder(data.order);\n    } catch (err) {\n      setOrder(null);\n      setError(err instanceof Error ? err.message : 'Failed to load order details');\n    } finally {\n      setLoading(false);\n    }\n  };\n\n  const handleVerifyEmail = async (event: React.FormEvent<HTMLFormElement>) => {\n    event.preventDefault();\n    if (!id || !verificationEmail.trim()) return;\n    setVerifyingEmail(true);\n    setError(null);\n    try {\n      const response = await fetch('/.netlify/functions/order-email-access', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ orderId: id, email: verificationEmail }),\n      });\n      const result = await response.json().catch(() => ({}));\n      if (!response.ok || !result.ok || !result.token) {\n        throw new Error(result.error || 'Order details could not be verified');\n      }\n      navigate(`/orders/${encodeURIComponent(result.orderId || id)}?token=${encodeURIComponent(result.token)}`, { replace: true });\n    } catch (verificationError) {\n      setError(verificationError instanceof Error ? verificationError.message : 'Order details could not be verified');\n    } finally {\n      setVerifyingEmail(false);\n    }\n  };",
    'OrderDetail robust fetch and email verification',
  );
  source = replaceOnce(
    source,
    "  if (error || !order) {",
    "  if (needsEmailVerification) {\n    return (\n      <Layout>\n        <div className=\"min-h-screen bg-gray-50 py-12\">\n          <div className=\"mx-auto max-w-lg px-4 sm:px-6\">\n            <div className=\"rounded-xl border border-gray-200 bg-white p-6 shadow-sm\">\n              <Mail className=\"mx-auto h-12 w-12 text-[#18448D]\" />\n              <h1 className=\"mt-4 text-center text-2xl font-bold text-gray-900\">Verify Your Order</h1>\n              <p className=\"mt-2 text-center text-sm text-gray-600\">Enter the email address used at checkout to securely view this order.</p>\n              <form className=\"mt-6 space-y-4\" onSubmit={handleVerifyEmail}>\n                <label className=\"block text-sm font-semibold text-gray-700\">\n                  Checkout email\n                  <input\n                    type=\"email\"\n                    required\n                    autoComplete=\"email\"\n                    value={verificationEmail}\n                    onChange={(event) => setVerificationEmail(event.target.value)}\n                    className=\"mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-[#18448D] focus:outline-none focus:ring-2 focus:ring-blue-100\"\n                    placeholder=\"you@example.com\"\n                  />\n                </label>\n                {error && <p className=\"rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700\">{error}</p>}\n                <button type=\"submit\" disabled={verifyingEmail} className=\"w-full rounded-lg bg-[#18448D] px-4 py-3 font-semibold text-white hover:bg-[#12366f] disabled:opacity-60\">\n                  {verifyingEmail ? 'Verifying…' : 'View Order'}\n                </button>\n              </form>\n            </div>\n          </div>\n        </div>\n      </Layout>\n    );\n  }\n\n  if (error || !order) {",
    'OrderDetail verification screen',
  );
  write(path, source);
}

// ---------------------------------------------------------------------------
// Email retry status must immediately clear the stale Admin badge
// ---------------------------------------------------------------------------
{
  const path = 'src/components/orders/EmailDeliveryStatus.tsx';
  let source = read(path);
  source = replaceOnce(
    source,
    "      toast({\n        title: 'Both order emails sent',\n        description: 'The customer confirmation and internal new-order notification were re-sent successfully.',\n      });",
    "      toast({\n        title: 'Both order emails sent',\n        description: 'The customer confirmation and internal new-order notification were re-sent successfully.',\n      });\n      window.setTimeout(() => window.location.reload(), 350);",
    'reload after initial order email recovery',
  );
  source = replaceOnce(
    source,
    "      const patch: Partial<Order> = {};\n      if (row.kind === 'in_production') patch.production_email_status = 'sent';\n      if (row.kind === 'shipped') patch.shipping_notification_status = 'sent';\n      applyPatch(patch);",
    "      const now = new Date().toISOString();\n      const patch: Partial<Order> = {};\n      if (row.kind === 'in_production') {\n        patch.production_email_status = 'sent';\n        patch.production_email_sent = true;\n        patch.production_email_sent_at = now;\n      }\n      if (row.kind === 'shipped') {\n        patch.shipping_notification_status = 'sent';\n        patch.shipping_notification_sent = true;\n        patch.shipping_notification_sent_at = now;\n      }\n      applyPatch(patch);",
    'complete supplemental email status patch',
  );
  source = replaceOnce(
    source,
    "      toast({\n        title: 'Email resent',\n        description: `${row.label} email was re-sent to the customer.`,\n      });",
    "      toast({\n        title: 'Email resent',\n        description: `${row.label} email was re-sent to the customer.`,\n      });\n      window.setTimeout(() => window.location.reload(), 350);",
    'reload after supplemental email recovery',
  );
  write(path, source);
}

// ---------------------------------------------------------------------------
// Admin tracking management and correct first-send/resend labels
// ---------------------------------------------------------------------------
{
  const path = 'src/pages/admin/Orders.tsx';
  let source = read(path);
  source = replaceOnce(
    source,
    "import { useNavigate } from 'react-router-dom';",
    "import { useNavigate, useSearchParams } from 'react-router-dom';",
    'Orders route query import',
  );
  source = replaceOnce(
    source,
    "  ChevronDown,\n  ChevronUp\n} from 'lucide-react';",
    "  ChevronDown,\n  ChevronUp,\n  Trash2\n} from 'lucide-react';",
    'Orders Trash2 import',
  );
  source = replaceOnce(
    source,
    "  const navigate = useNavigate();\n  const { user, loading: authLoading } = useAuth();",
    "  const navigate = useNavigate();\n  const [routeSearchParams] = useSearchParams();\n  const requestedOrderId = routeSearchParams.get('order') || '';\n  const { user, loading: authLoading } = useAuth();",
    'Orders requested order query state',
  );
  source = replaceOnce(
    source,
    "  useEffect(() => {\n    // Filter orders based on search query",
    "  useEffect(() => {\n    if (requestedOrderId) setSearchQuery(requestedOrderId.slice(-8));\n  }, [requestedOrderId]);\n\n  useEffect(() => {\n    // Filter orders based on search query",
    'Orders requested order filter effect',
  );
  source = replaceAllChecked(
    source,
    "                status: savedTrackingNumbers.length > 0 ? 'shipped' : order.status // Update status to shipped only when tracking is added",
    "                status: savedTrackingNumbers.length > 0 ? 'shipped' : order.status,\n                shipping_notification_sent: false,\n                shipping_notification_sent_at: null,\n                shipping_notification_status: 'pending'",
    1,
    'reset tracking email state after initial tracking save',
  );
  source = replaceOnce(
    source,
    "                trackingNumbers: savedTrackingNumbers,\n                // Don't change status when updating existing tracking",
    "                trackingNumbers: savedTrackingNumbers,\n                shipping_notification_sent: false,\n                shipping_notification_sent_at: null,\n                shipping_notification_status: 'pending',\n                // Don't change status when updating existing tracking",
    'reset tracking email state after edit',
  );
  source = replaceOnce(
    source,
    "  const handleFileDownload = async (fileKey: string, orderId: string, itemIndex: number) => {",
    "  const handleDeleteTracking = async (orderId: string) => {\n    if (!window.confirm('Delete all tracking numbers for this order? The tracking email status will also be reset.')) return;\n    try {\n      const ordersAdapter = await getOrdersAdapter();\n      await ordersAdapter.updateTracking(orderId, 'fedex', '', []);\n      setOrders((current) => current.map((order) => {\n        if (order.id !== orderId) return order;\n        const nextStatus = order.status === 'shipped'\n          ? (order.production_email_sent ? 'in_production' : 'paid')\n          : order.status;\n        return {\n          ...order,\n          tracking_number: null,\n          tracking_numbers: [],\n          trackingNumbers: [],\n          tracking_carrier: null,\n          status: nextStatus as Order['status'],\n          shipping_notification_sent: false,\n          shipping_notification_sent_at: null,\n          shipping_notification_status: 'pending',\n        };\n      }));\n      toast({ title: 'Tracking Deleted', description: `Tracking was removed from order #${orderId.slice(-8).toUpperCase()}.` });\n    } catch (error) {\n      console.error('Delete tracking failed:', error);\n      toast({\n        title: 'Unable to Delete Tracking',\n        description: error instanceof Error ? error.message : 'Tracking could not be deleted.',\n        variant: 'destructive',\n      });\n    }\n  };\n\n  const handleFileDownload = async (fileKey: string, orderId: string, itemIndex: number) => {",
    'Orders delete tracking handler',
  );
  source = replaceOnce(
    source,
    "        title: \"Tracking email sent successfully\",\n        description: `Customer has been notified about order #${orderId.slice(-8)}`",
    "        title: result.wasResend ? 'Tracking email resent successfully' : 'Tracking email sent successfully',\n        description: `Customer has been notified about order #${orderId.slice(-8)}`",
    'tracking send versus resend toast',
  );
  source = replaceOnce(
    source,
    "        description: \"Unable to send email. Please try again.\",",
    "        description: error instanceof Error ? error.message : 'Unable to send email. Please try again.',",
    'surface tracking email provider error',
  );
  source = replaceOnce(
    source,
    "                status: 'in_production' as const,\n                production_email_sent: result.emailSent ?? true,\n                production_email_sent_at: new Date().toISOString()",
    "                status: 'in_production' as const,\n                production_email_sent: result.emailSent === true,\n                production_email_sent_at: result.emailSent ? new Date().toISOString() : null,\n                production_email_status: result.emailSent ? 'sent' : 'error'",
    'complete in-production local email status',
  );
  source = replaceAllChecked(
    source,
    "                       onUpdateTracking={handleUpdateTracking}\n                       onFileDownload={handleFileDownload}",
    "                       onUpdateTracking={handleUpdateTracking}\n                       onDeleteTracking={handleDeleteTracking}\n                       onFileDownload={handleFileDownload}",
    2,
    'pass delete tracking into admin cards',
  );
  source = replaceAllChecked(
    source,
    "  onUpdateTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => void;\n  onFileDownload:",
    "  onUpdateTracking: (orderId: string, carrier: TrackingCarrier, trackingNumber: string, trackingNumbers?: TrackingEntry[]) => void;\n  onDeleteTracking: (orderId: string) => void;\n  onFileDownload:",
    2,
    'Admin card delete tracking prop type',
  );
  source = replaceOnce(
    source,
    "  onUpdateTracking,\n  onFileDownload,",
    "  onUpdateTracking,\n  onDeleteTracking,\n  onFileDownload,",
    'desktop row delete tracking prop',
  );
  source = replaceOnce(
    source,
    "  order,\n  onPdfDownload,\n  onSendShippingNotification,",
    "  order,\n  onPdfDownload,\n  onDeleteTracking,\n  onSendShippingNotification,",
    'mobile card delete tracking prop',
  );
  source = replaceOnce(
    source,
    "                  {!isEditingTracking && (\n                    <Button\n                      size=\"sm\"\n                      variant=\"ghost\"\n                      onClick={handleEditTracking}\n                      className=\"h-7 px-2 text-xs\"\n                    >\n                      <Edit3 className=\"h-3 w-3 mr-1\" />\n                      Edit\n                    </Button>\n                  )}",
    "                  {!isEditingTracking && (\n                    <>\n                      <Button size=\"sm\" variant=\"ghost\" onClick={handleEditTracking} className=\"h-7 px-2 text-xs\">\n                        <Edit3 className=\"h-3 w-3 mr-1\" />Edit\n                      </Button>\n                      <Button size=\"sm\" variant=\"ghost\" onClick={() => onDeleteTracking(order.id)} className=\"h-7 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800\">\n                        <Trash2 className=\"h-3 w-3 mr-1\" />Delete\n                      </Button>\n                    </>\n                  )}",
    'desktop tracking edit/delete controls',
  );
  source = replaceOnce(
    source,
    "{isSendingNotification ? 'Sending…' : order.shipping_notification_sent ? 'Resend Tracking Email' : 'Resend Tracking Email'}",
    "{isSendingNotification ? 'Sending…' : order.shipping_notification_sent ? 'Resend Tracking Email' : 'Send Tracking Email'}",
    'desktop first tracking email label',
  );
  source = replaceOnce(
    source,
    "{isSendingNotification ? <><Loader2 className=\"h-3 w-3 mr-1 animate-spin\" />Sending...</> : <><Mail className=\"h-3 w-3 mr-1\" />Resend Tracking Email</>}",
    "{isSendingNotification ? <><Loader2 className=\"h-3 w-3 mr-1 animate-spin\" />Sending...</> : <><Mail className=\"h-3 w-3 mr-1\" />{order.shipping_notification_sent ? 'Resend Tracking Email' : 'Send Tracking Email'}</>}",
    'mobile first tracking email label',
  );
  source = replaceOnce(
    source,
    "                  <div className=\"space-y-1\">\n                  {displayedTrackingRows.map((row, index) => (\n                    <div key={`${row.trackingNumber}-${index}`} className=\"flex flex-wrap items-center gap-2\">\n                      <Badge className=\"bg-green-100 text-green-800\"><Truck className=\"h-3 w-3 mr-1\" />FEDEX</Badge>\n                      <span className=\"text-xs font-semibold text-gray-700\">{row.label || `Package ${index + 1}`}</span>\n                      <a href={fedexUrl(row.trackingNumber)} target=\"_blank\" rel=\"noopener noreferrer\" className=\"text-xs text-blue-600 hover:underline break-all\">{row.trackingNumber}</a><Button type=\"button\" size=\"sm\" variant=\"ghost\" onClick={async () => { await copyText(row.trackingNumber); setCopiedKey(`row-${index}`); setTimeout(() => setCopiedKey(null), 2000); }} className=\"h-7 px-2 text-xs\"><Copy className=\"mr-1 h-3 w-3\" />{copiedKey === `row-${index}` ? 'Copied' : 'Copy'}</Button>\n                    </div>\n                  ))}\n                </div>",
    "                  <div className=\"space-y-1\">\n                  {displayedTrackingRows.map((row, index) => (\n                    <div key={`${row.trackingNumber}-${index}`} className=\"flex flex-wrap items-center gap-2\">\n                      <Badge className=\"bg-green-100 text-green-800\"><Truck className=\"h-3 w-3 mr-1\" />FEDEX</Badge>\n                      <span className=\"text-xs font-semibold text-gray-700\">{row.label || `Package ${index + 1}`}</span>\n                      <a href={fedexUrl(row.trackingNumber)} target=\"_blank\" rel=\"noopener noreferrer\" className=\"text-xs text-blue-600 hover:underline break-all\">{row.trackingNumber}</a><Button type=\"button\" size=\"sm\" variant=\"ghost\" onClick={async () => { await copyText(row.trackingNumber); setCopiedKey(`row-${index}`); setTimeout(() => setCopiedKey(null), 2000); }} className=\"h-7 px-2 text-xs\"><Copy className=\"mr-1 h-3 w-3\" />{copiedKey === `row-${index}` ? 'Copied' : 'Copy'}</Button>\n                    </div>\n                  ))}\n                </div>\n                <Button type=\"button\" size=\"sm\" variant=\"outline\" onClick={() => onDeleteTracking(order.id)} className=\"mt-2 w-full border-red-200 text-xs text-red-700 hover:bg-red-50\">\n                  <Trash2 className=\"mr-1 h-3 w-3\" />Delete Tracking\n                </Button>",
    'mobile tracking delete control',
  );
  write(path, source);
}

console.log('Applied order email access, email recovery, and tracking UI hotfixes.');
