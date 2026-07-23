import {
  AddRounded,
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  ContentCopyRounded,
  DeleteRounded,
  SearchRounded,
} from '@mui/icons-material'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MonacoEditor } from '@/components/base'
import { getRuntimeProxyGroupOrder } from '@/services/cmds'
import { useThemeMode } from '@/services/states'

interface Props {
  open: boolean
  title: string
  value: string
  path: string
  readOnly?: boolean
  onSave?: (value: string) => Promise<void>
  onClose: () => void
}

interface VisualRule {
  id: string
  type: string
  payload: string
  policy: string
  options: string
}

interface RuleDocument {
  root: Record<string, unknown>
  key: 'rules' | 'payload'
  rules: VisualRule[]
  sequenceRoot: boolean
}

const RULE_TYPES = [
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-REGEX',
  'GEOSITE',
  'IP-CIDR',
  'IP-CIDR6',
  'IP-SUFFIX',
  'IP-ASN',
  'GEOIP',
  'SRC-IP-CIDR',
  'SRC-IP-SUFFIX',
  'SRC-GEOIP',
  'SRC-IP-ASN',
  'DST-PORT',
  'SRC-PORT',
  'IN-PORT',
  'PROCESS-NAME',
  'PROCESS-PATH',
  'PROCESS-NAME-REGEX',
  'PROCESS-PATH-REGEX',
  'IN-TYPE',
  'IN-USER',
  'IN-NAME',
  'UID',
  'NETWORK',
  'DSCP',
  'RULE-SET',
  'AND',
  'OR',
  'NOT',
  'SUB-RULE',
  'MATCH',
] as const

const BUILTIN_POLICIES = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS']
const NO_PAYLOAD_TYPES = new Set(['MATCH'])

let nextRuleId = 0
const createRuleId = () => `visual-rule-${nextRuleId++}`

const splitRule = (line: string) => {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const character of line) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === '\\') {
      current += character
      escaped = true
      continue
    }
    if (quote) {
      current += character
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      current += character
      quote = character
      continue
    }
    if ('([{'.includes(character)) depth += 1
    if (')]}'.includes(character)) depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  parts.push(current.trim())
  return parts
}

const isRuleOption = (value: string) => {
  const normalized = value.toLowerCase()
  return (
    normalized === 'no-resolve' ||
    normalized.startsWith('src=') ||
    normalized.startsWith('network=')
  )
}

const parseRule = (line: string, payloadOnly = false): VisualRule => {
  if (payloadOnly) {
    return {
      id: createRuleId(),
      type: 'PAYLOAD',
      payload: line,
      policy: '',
      options: '',
    }
  }

  const parts = splitRule(line)
  const type = parts.shift()?.toUpperCase() || 'DOMAIN-SUFFIX'
  const options: string[] = []
  while (parts.length > 1 && isRuleOption(parts.at(-1) ?? '')) {
    options.unshift(parts.pop()!)
  }

  if (NO_PAYLOAD_TYPES.has(type)) {
    return {
      id: createRuleId(),
      type,
      payload: '',
      policy: parts[0] ?? '',
      options: options.join(','),
    }
  }

  return {
    id: createRuleId(),
    type,
    payload: parts.slice(0, -1).join(','),
    policy: parts.at(-1) ?? '',
    options: options.join(','),
  }
}

const formatRule = (rule: VisualRule, payloadOnly = false) => {
  if (payloadOnly) return rule.payload.trim()
  const parts = NO_PAYLOAD_TYPES.has(rule.type)
    ? [rule.type, rule.policy]
    : [rule.type, rule.payload, rule.policy]
  if (rule.options.trim()) parts.push(rule.options.trim())
  return parts.map((part) => part.trim()).join(',')
}

const parseDocument = (source: string): RuleDocument => {
  const parsed = yaml.load(source)
  if (Array.isArray(parsed)) {
    return {
      root: {},
      key: 'rules',
      rules: parsed.map((rule) => parseRule(String(rule))),
      sequenceRoot: true,
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Rule source must be a YAML mapping or sequence')
  }

  const root = parsed as Record<string, unknown>
  const hasSupportedData =
    Array.isArray(root.rules) ||
    Array.isArray(root.payload) ||
    (root['rule-providers'] !== null &&
      typeof root['rule-providers'] === 'object' &&
      !Array.isArray(root['rule-providers'])) ||
    (root['sub-rules'] !== null &&
      typeof root['sub-rules'] === 'object' &&
      !Array.isArray(root['sub-rules']))
  if (!hasSupportedData) {
    throw new Error(
      'Rule source must contain rules, payload, rule-providers, or sub-rules',
    )
  }

  const key = Array.isArray(root.rules)
    ? 'rules'
    : Array.isArray(root.payload)
      ? 'payload'
      : 'rules'
  const rawRules = root[key]
  const payloadOnly = key === 'payload'
  return {
    root,
    key,
    rules: Array.isArray(rawRules)
      ? rawRules.map((rule) => parseRule(String(rule), payloadOnly))
      : [],
    sequenceRoot: false,
  }
}

const serializeDocument = (document: RuleDocument) => {
  const rules = document.rules.map((rule) =>
    formatRule(rule, document.key === 'payload'),
  )
  return yaml.dump(
    document.sequenceRoot ? rules : { ...document.root, [document.key]: rules },
    { forceQuotes: true, lineWidth: -1 },
  )
}

const initialDocument = (value: string) => {
  try {
    return { parsed: parseDocument(value), error: '' }
  } catch (error) {
    return {
      parsed: {
        root: {},
        key: 'rules' as const,
        rules: [],
        sequenceRoot: false,
      },
      error: String(error),
    }
  }
}

export const RuleSourceEditor = ({
  open,
  title,
  value,
  path,
  readOnly = false,
  onSave,
  onClose,
}: Props) => {
  const { t } = useTranslation()
  const themeMode = useThemeMode()
  const initial = initialDocument(value)
  const [tab, setTab] = useState(initial.error ? 1 : 0)
  const [draft, setDraft] = useState(value)
  const [document, setDocument] = useState(initial.parsed)
  const [error, setError] = useState(initial.error)
  const [policyOptions, setPolicyOptions] = useState(BUILTIN_POLICIES)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [policyFilter, setPolicyFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(50)
  const [formType, setFormType] = useState<string>('DOMAIN-SUFFIX')
  const [formPayload, setFormPayload] = useState('')
  const [formPolicy, setFormPolicy] = useState('DIRECT')
  const [formOptions, setFormOptions] = useState('')
  const payloadOnly = document.key === 'payload'

  useEffect(() => {
    void getRuntimeProxyGroupOrder()
      .then((groups) =>
        setPolicyOptions(
          Array.from(
            new Set([
              ...BUILTIN_POLICIES,
              ...groups.filter((group) => !/[,\r\n]/u.test(group)),
            ]),
          ),
        ),
      )
      .catch(() => {})
  }, [])

  const updateRules = (rules: VisualRule[]) => {
    const next = { ...document, rules }
    setDocument(next)
    setDraft(serializeDocument(next))
    setError('')
  }

  const openVisualMode = () => {
    try {
      const parsed = parseDocument(draft)
      setDocument(parsed)
      setError('')
      setTab(0)
    } catch (nextError) {
      setError(String(nextError))
      setTab(1)
    }
  }

  const handleSave = useLockFn(async () => {
    try {
      parseDocument(draft)
      await onSave?.(draft)
      onClose()
    } catch (nextError) {
      setError(String(nextError))
    }
  })

  const addRule = (position: 'start' | 'end') => {
    if (!formPayload.trim() && !NO_PAYLOAD_TYPES.has(formType)) return
    if (!payloadOnly && !formPolicy.trim()) return
    const rule: VisualRule = {
      id: createRuleId(),
      type: payloadOnly ? 'PAYLOAD' : formType,
      payload: NO_PAYLOAD_TYPES.has(formType) ? '' : formPayload.trim(),
      policy: payloadOnly ? '' : formPolicy.trim(),
      options: payloadOnly ? '' : formOptions.trim(),
    }
    updateRules(
      position === 'start'
        ? [rule, ...document.rules]
        : [...document.rules, rule],
    )
    setFormPayload('')
    setFormOptions('')
  }

  const replaceRule = (index: number, patch: Partial<VisualRule>) => {
    updateRules(
      document.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    )
  }

  const filteredRules = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return document.rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => {
        if (typeFilter !== 'ALL' && rule.type !== typeFilter) return false
        if (policyFilter !== 'ALL' && rule.policy !== policyFilter) return false
        return (
          !normalizedSearch ||
          formatRule(rule, payloadOnly).toLowerCase().includes(normalizedSearch)
        )
      })
  }, [document.rules, payloadOnly, policyFilter, search, typeFilter])

  const availableTypes = useMemo(
    () => Array.from(new Set(document.rules.map((rule) => rule.type))).sort(),
    [document.rules],
  )
  const availablePolicies = useMemo(
    () => Array.from(new Set(document.rules.map((rule) => rule.policy))).sort(),
    [document.rules],
  )
  const pagedRules = filteredRules.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent
        sx={{
          height: 'calc(100vh - 170px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, nextTab: number) => {
            if (nextTab === 0) openVisualMode()
            else setTab(1)
          }}
          sx={{ mb: 1 }}
        >
          <Tab label={t('rules.page.sources.editor.visual')} />
          <Tab label="YAML" />
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        {tab === 0 ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {!readOnly && (
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1}
                sx={{ alignItems: { md: 'center' } }}
              >
                <Autocomplete
                  size="small"
                  disableClearable
                  disabled={payloadOnly}
                  options={payloadOnly ? ['PAYLOAD'] : RULE_TYPES}
                  value={
                    payloadOnly
                      ? 'PAYLOAD'
                      : (formType as (typeof RULE_TYPES)[number])
                  }
                  sx={{ minWidth: 180 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('rules.modals.editor.form.labels.type')}
                    />
                  )}
                  onChange={(_, ruleType) => setFormType(ruleType)}
                />
                <TextField
                  size="small"
                  fullWidth
                  disabled={NO_PAYLOAD_TYPES.has(formType)}
                  label={t('rules.modals.editor.form.labels.content')}
                  value={formPayload}
                  onChange={(event) => setFormPayload(event.target.value)}
                />
                <Autocomplete
                  freeSolo
                  size="small"
                  disabled={payloadOnly}
                  options={policyOptions}
                  value={formPolicy}
                  sx={{ minWidth: 180 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('rules.modals.editor.form.labels.proxyPolicy')}
                    />
                  )}
                  onInputChange={(_, policy) => setFormPolicy(policy)}
                />
                <TextField
                  size="small"
                  disabled={payloadOnly}
                  sx={{ minWidth: 135 }}
                  label={t('rules.page.sources.editor.options')}
                  placeholder="no-resolve"
                  value={formOptions}
                  onChange={(event) => setFormOptions(event.target.value)}
                />
                <Stack direction="row" spacing={0.5}>
                  <Button
                    variant="outlined"
                    startIcon={<AddRounded />}
                    onClick={() => addRule('start')}
                  >
                    {t('rules.modals.editor.form.actions.prependRule')}
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<AddRounded />}
                    onClick={() => addRule('end')}
                  >
                    {t('rules.modals.editor.form.actions.appendRule')}
                  </Button>
                </Stack>
              </Stack>
            )}

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'center' } }}
            >
              <TextField
                size="small"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(0)
                }}
                placeholder={t('rules.page.sources.editor.searchPlaceholder')}
                sx={{ flex: 1 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRounded fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                select
                size="small"
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value)
                  setPage(0)
                }}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="ALL">
                  {t('rules.page.sources.editor.allTypes')}
                </MenuItem>
                {availableTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                value={policyFilter}
                onChange={(event) => {
                  setPolicyFilter(event.target.value)
                  setPage(0)
                }}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="ALL">
                  {t('rules.page.sources.editor.allPolicies')}
                </MenuItem>
                {availablePolicies.map((policy) => (
                  <MenuItem key={policy} value={policy}>
                    {policy}
                  </MenuItem>
                ))}
              </TextField>
              <Chip
                variant="outlined"
                label={`${filteredRules.length} / ${document.rules.length}`}
              />
            </Stack>

            {document.rules.length === 0 ? (
              <Typography
                color="text.secondary"
                sx={{ py: 4, textAlign: 'center' }}
              >
                {t('rules.page.sources.editor.empty')}
              </Typography>
            ) : (
              <>
                <TableContainer
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 54 }}>#</TableCell>
                        <TableCell sx={{ width: 190 }}>
                          {t('rules.page.sources.editor.type')}
                        </TableCell>
                        <TableCell>
                          {t('rules.page.sources.editor.match')}
                        </TableCell>
                        <TableCell sx={{ width: 190 }}>
                          {t('rules.page.sources.editor.policy')}
                        </TableCell>
                        <TableCell sx={{ width: 130 }}>
                          {t('rules.page.sources.editor.options')}
                        </TableCell>
                        {!readOnly && (
                          <TableCell align="right" sx={{ width: 160 }} />
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pagedRules.map(({ rule, index }) => (
                        <TableRow key={rule.id} hover>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            {readOnly || payloadOnly ? (
                              <Chip size="small" label={rule.type} />
                            ) : (
                              <Autocomplete
                                size="small"
                                disableClearable
                                options={RULE_TYPES}
                                value={rule.type as (typeof RULE_TYPES)[number]}
                                renderInput={(params) => (
                                  <TextField {...params} variant="standard" />
                                )}
                                onChange={(_, type) =>
                                  replaceRule(index, {
                                    type,
                                    payload: NO_PAYLOAD_TYPES.has(type)
                                      ? ''
                                      : rule.payload,
                                  })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {readOnly ? (
                              <Typography
                                variant="body2"
                                sx={{ overflowWrap: 'anywhere' }}
                              >
                                {rule.payload || '—'}
                              </Typography>
                            ) : (
                              <TextField
                                fullWidth
                                variant="standard"
                                disabled={NO_PAYLOAD_TYPES.has(rule.type)}
                                value={rule.payload}
                                onChange={(event) =>
                                  replaceRule(index, {
                                    payload: event.target.value,
                                  })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {readOnly || payloadOnly ? (
                              <Typography variant="body2">
                                {rule.policy || '—'}
                              </Typography>
                            ) : (
                              <Autocomplete
                                freeSolo
                                size="small"
                                options={policyOptions}
                                value={rule.policy}
                                renderInput={(params) => (
                                  <TextField {...params} variant="standard" />
                                )}
                                onInputChange={(_, policy) =>
                                  replaceRule(index, { policy })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {readOnly || payloadOnly ? (
                              <Typography variant="caption">
                                {rule.options || '—'}
                              </Typography>
                            ) : (
                              <TextField
                                fullWidth
                                variant="standard"
                                value={rule.options}
                                onChange={(event) =>
                                  replaceRule(index, {
                                    options: event.target.value,
                                  })
                                }
                              />
                            )}
                          </TableCell>
                          {!readOnly && (
                            <TableCell align="right">
                              <Tooltip
                                title={t('rules.page.sources.editor.moveUp')}
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={index === 0}
                                    onClick={() => {
                                      const next = [...document.rules]
                                      ;[next[index - 1], next[index]] = [
                                        next[index],
                                        next[index - 1],
                                      ]
                                      updateRules(next)
                                    }}
                                  >
                                    <ArrowUpwardRounded fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip
                                title={t('rules.page.sources.editor.moveDown')}
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={
                                      index === document.rules.length - 1
                                    }
                                    onClick={() => {
                                      const next = [...document.rules]
                                      ;[next[index], next[index + 1]] = [
                                        next[index + 1],
                                        next[index],
                                      ]
                                      updateRules(next)
                                    }}
                                  >
                                    <ArrowDownwardRounded fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip
                                title={t('rules.page.sources.editor.duplicate')}
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    const next = [...document.rules]
                                    next.splice(index + 1, 0, {
                                      ...rule,
                                      id: createRuleId(),
                                    })
                                    updateRules(next)
                                  }}
                                >
                                  <ContentCopyRounded fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() =>
                                  updateRules(
                                    document.rules.filter(
                                      (_, ruleIndex) => ruleIndex !== index,
                                    ),
                                  )
                                }
                              >
                                <DeleteRounded fontSize="small" />
                              </IconButton>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={filteredRules.length}
                  page={Math.min(
                    page,
                    Math.max(
                      0,
                      Math.ceil(filteredRules.length / rowsPerPage) - 1,
                    ),
                  )}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[25, 50, 100]}
                  onPageChange={(_, nextPage) => setPage(nextPage)}
                  onRowsPerPageChange={(event) => {
                    setRowsPerPage(Number(event.target.value))
                    setPage(0)
                  }}
                />
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <MonacoEditor
              height="100%"
              path={path}
              value={draft}
              language="yaml"
              theme={themeMode === 'light' ? 'light' : 'vs-dark'}
              loading={null}
              options={{ readOnly }}
              onChange={(nextValue) => {
                setDraft(nextValue ?? '')
                setError('')
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('shared.actions.cancel')}</Button>
        {!readOnly && (
          <Button variant="contained" onClick={() => void handleSave()}>
            {t('shared.actions.save')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
