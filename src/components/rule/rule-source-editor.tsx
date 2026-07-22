import {
  AddRounded,
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  DeleteRounded,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MonacoEditor } from '@/components/base'
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

type RuleDocument = {
  root: Record<string, unknown>
  key: 'rules' | 'payload'
  rules: string[]
  ruleIds: string[]
}

let nextRuleId = 0
const createRuleIds = (count: number) =>
  Array.from({ length: count }, () => `rule-source-row-${nextRuleId++}`)

const parseDocument = (document: string): RuleDocument => {
  const parsed = yaml.load(document)
  if (Array.isArray(parsed)) {
    const rules = parsed.map(String)
    return {
      root: {},
      key: 'rules',
      rules,
      ruleIds: createRuleIds(rules.length),
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
  const rules = Array.isArray(rawRules) ? rawRules.map(String) : []
  return {
    root,
    key,
    rules,
    ruleIds: createRuleIds(rules.length),
  }
}

const initialDocument = (value: string) => {
  try {
    return { parsed: parseDocument(value), error: '' }
  } catch (error) {
    return {
      parsed: { root: {}, key: 'rules' as const, rules: [], ruleIds: [] },
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

  const updateRules = (rules: string[], ruleIds = document.ruleIds) => {
    const next = { ...document, rules, ruleIds }
    setDocument(next)
    setDraft(
      yaml.dump(
        { ...next.root, [next.key]: rules },
        { forceQuotes: true, lineWidth: -1 },
      ),
    )
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent
        sx={{
          height: 'calc(100vh - 190px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value: number) => {
            if (value === 0) openVisualMode()
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
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {document.rules.length === 0 ? (
              <Typography
                color="text.secondary"
                sx={{ py: 4, textAlign: 'center' }}
              >
                {t('rules.page.sources.editor.empty')}
              </Typography>
            ) : (
              document.rules.map((rule, index) => (
                <Box
                  key={document.ruleIds[index]}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mb: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ width: 34, textAlign: 'right' }}
                  >
                    {index + 1}
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={rule}
                    slotProps={{ input: { readOnly } }}
                    onChange={(event) => {
                      const next = [...document.rules]
                      next[index] = event.target.value
                      updateRules(next)
                    }}
                  />
                  {!readOnly && (
                    <>
                      <IconButton
                        size="small"
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...document.rules]
                          const nextIds = [...document.ruleIds]
                          ;[next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ]
                          ;[nextIds[index - 1], nextIds[index]] = [
                            nextIds[index],
                            nextIds[index - 1],
                          ]
                          updateRules(next, nextIds)
                        }}
                      >
                        <ArrowUpwardRounded fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={index === document.rules.length - 1}
                        onClick={() => {
                          const next = [...document.rules]
                          const nextIds = [...document.ruleIds]
                          ;[next[index], next[index + 1]] = [
                            next[index + 1],
                            next[index],
                          ]
                          ;[nextIds[index], nextIds[index + 1]] = [
                            nextIds[index + 1],
                            nextIds[index],
                          ]
                          updateRules(next, nextIds)
                        }}
                      >
                        <ArrowDownwardRounded fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() =>
                          updateRules(
                            document.rules.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                            document.ruleIds.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <DeleteRounded fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Box>
              ))
            )}
            {!readOnly && (
              <Button
                startIcon={<AddRounded />}
                onClick={() =>
                  updateRules(
                    [...document.rules, 'DOMAIN,example.com,DIRECT'],
                    [...document.ruleIds, ...createRuleIds(1)],
                  )
                }
              >
                {t('rules.page.sources.editor.addRule')}
              </Button>
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
              onChange={(value) => {
                setDraft(value ?? '')
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
