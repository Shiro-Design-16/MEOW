import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AddRounded,
  AppsOutlined,
  DeleteRounded,
  DragIndicatorRounded,
  EditRounded,
  LockRounded,
  PreviewRounded,
  RuleRounded,
  TuneRounded,
  UploadFileRounded,
  VisibilityRounded,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  Switch,
  VirtualList,
  type VirtualListHandle,
} from '@/components/base'
import { ScrollTopButton } from '@/components/layout/scroll-top-button'
import { ProfileMore } from '@/components/profile/profile-more'
import { RulesEditorViewer } from '@/components/profile/rules-editor-viewer'
import { ProviderButton } from '@/components/rule/provider-button'
import RuleItem from '@/components/rule/rule-item'
import { RuleSourceEditor } from '@/components/rule/rule-source-editor'
import { useProfiles } from '@/hooks/use-profiles'
import { useVerge } from '@/hooks/use-verge'
import { useVisibility } from '@/hooks/use-visibility'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import {
  createRuleSource,
  deleteRuleSourceFile,
  enhanceProfiles,
  getRuntimeLogs,
  importRuleSource,
  readProfileFile,
  readRuleSourceFile,
  saveRuleSourceFile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { useQuery } from '@/services/query-client'

import AppRoutingPage from './app-routing'

const ACTIVE_RULE_SOURCE_UID = '__active_profile__'
const EMPTY_RULE_SOURCES: IRuleSource[] = []

type PageView = 'sources' | 'preview' | 'app-routing'

interface SourceRow {
  uid: string
  name: string
  enabled: boolean
  readOnly: boolean
  content: string
  error?: string
}

interface EditorState {
  uid: string
  title: string
  value: string
  readOnly: boolean
}

const extractRuleDocument = (raw: string) => {
  try {
    const parsed = yaml.load(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'rules: []\n'
    }
    const config = parsed as Record<string, unknown>
    const document: Record<string, unknown> = {}
    for (const key of ['rule-providers', 'sub-rules', 'rules']) {
      if (config[key] !== undefined) document[key] = config[key]
    }
    if (!Array.isArray(document.rules)) document.rules = []
    return yaml.dump(document, { forceQuotes: true, lineWidth: -1 })
  } catch {
    return 'rules: []\n'
  }
}

const countRules = (content: string) => {
  try {
    const parsed = yaml.load(content)
    if (Array.isArray(parsed)) return parsed.length
    if (!parsed || typeof parsed !== 'object') return 0
    const mapping = parsed as Record<string, unknown>
    if (Array.isArray(mapping.rules)) return mapping.rules.length
    if (Array.isArray(mapping.payload)) return mapping.payload.length
  } catch {
    return 0
  }
  return 0
}

interface SortableSourceProps {
  source: SourceRow
  onOpen: () => void
  onEditOverride?: () => void
  onToggle: (enabled: boolean) => void
  onDelete: () => void
}

const SortableSource = ({
  source,
  onOpen,
  onEditOverride,
  onToggle,
  onDelete,
}: SortableSourceProps) => {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: source.uid })

  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1.25,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <IconButton size="small" {...attributes} {...listeners}>
        <DragIndicatorRounded />
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 600 }} noWrap>
            {source.name}
          </Typography>
          {source.readOnly && (
            <Chip
              size="small"
              icon={<LockRounded />}
              label={t('rules.page.sources.active.locked')}
            />
          )}
          {source.error && (
            <Chip
              size="small"
              color="error"
              label={t('rules.page.sources.status.invalid')}
            />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {t('rules.page.sources.ruleCount', {
            count: countRules(source.content),
          })}
        </Typography>
      </Box>
      {source.readOnly ? (
        <LockRounded color="action" fontSize="small" />
      ) : (
        <Switch
          checked={source.enabled}
          onChange={(_, checked) => onToggle(checked)}
        />
      )}
      <IconButton title={t('rules.page.sources.actions.open')} onClick={onOpen}>
        <VisibilityRounded />
      </IconButton>
      {onEditOverride && (
        <IconButton
          color="primary"
          title={t('rules.page.sources.actions.editOverride')}
          onClick={onEditOverride}
        >
          <EditRounded />
        </IconButton>
      )}
      {!source.readOnly && (
        <IconButton
          color="error"
          title={t('shared.actions.delete')}
          onClick={onDelete}
        >
          <DeleteRounded />
        </IconButton>
      )}
    </Paper>
  )
}

const EffectiveRules = () => {
  const { t } = useTranslation()
  const { rules = [] } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const [match, setMatch] = useState(() => (_: string) => true)
  const virtuosoRef = useRef<VirtualListHandle>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const pageVisible = useVisibility()

  useEffect(() => {
    refreshRules()
    refreshRuleProviders()
  }, [refreshRules, refreshRuleProviders, pageVisible])

  const filteredRules = useMemo(
    () =>
      rules
        .map((item, index) => ({ ...item, lineNo: index + 1 }))
        .filter((item) => match(item.payload ?? '')),
    [rules, match],
  )

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Alert severity="info" sx={{ mx: 1.25, mt: 1 }}>
        {t('rules.page.preview.description')}
      </Alert>
      <Box sx={{ py: 1, mx: 1.25 }}>
        <BaseSearchBox onSearch={(nextMatch) => setMatch(() => nextMatch)} />
      </Box>
      {filteredRules.length > 0 ? (
        <>
          <VirtualList
            ref={virtuosoRef}
            count={filteredRules.length}
            estimateSize={40}
            renderItem={(index) => <RuleItem value={filteredRules[index]} />}
            style={{ flex: 1 }}
            onScroll={(event) =>
              setShowScrollTop((event.target as HTMLElement).scrollTop > 100)
            }
          />
          <ScrollTopButton
            show={showScrollTop}
            onClick={() =>
              virtuosoRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }
          />
        </>
      ) : (
        <BaseEmpty />
      )}
    </Box>
  )
}

const RulesPage = () => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const { profiles = {} } = useProfiles()
  const [view, setView] = useState<PageView>('sources')
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [subscriptionRulesOpen, setSubscriptionRulesOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const sources = verge?.rule_sources ?? EMPTY_RULE_SOURCES
  const { data: chainLogs = {} } = useQuery({
    queryKey: ['getRuntimeLogs'],
    queryFn: getRuntimeLogs,
  })

  const activeProfile = profiles.items?.find(
    (profile) => profile.uid === profiles.current,
  )
  const activeProfileUid = profiles.current
  const sourceMap = useMemo(
    () => new Map(sources.map((source) => [source.uid, source])),
    [sources],
  )
  const resolvedOrder = useMemo(() => {
    const valid = new Set([
      ACTIVE_RULE_SOURCE_UID,
      ...sources.map((source) => source.uid),
    ])
    const seen = new Set<string>()
    const order: string[] = []
    for (const uid of pendingOrder ?? verge?.rule_source_order ?? []) {
      if (valid.has(uid) && !seen.has(uid)) {
        order.push(uid)
        seen.add(uid)
      }
    }
    for (const uid of [
      ACTIVE_RULE_SOURCE_UID,
      ...sources.map((source) => source.uid),
    ]) {
      if (!seen.has(uid)) order.push(uid)
    }
    return order
  }, [pendingOrder, sources, verge?.rule_source_order])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const nextContents: Record<string, string> = {}
      const nextErrors: Record<string, string> = {}
      if (activeProfileUid) {
        try {
          nextContents[ACTIVE_RULE_SOURCE_UID] = extractRuleDocument(
            await readProfileFile(activeProfileUid),
          )
        } catch (error) {
          nextErrors[ACTIVE_RULE_SOURCE_UID] = String(error)
        }
      } else {
        nextContents[ACTIVE_RULE_SOURCE_UID] = 'rules: []\n'
      }
      await Promise.all(
        sources.map(async (source) => {
          try {
            nextContents[source.uid] = await readRuleSourceFile(source.uid)
          } catch (error) {
            nextErrors[source.uid] = String(error)
          }
        }),
      )
      if (!cancelled) {
        setContents(nextContents)
        setErrors(nextErrors)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [activeProfileUid, sources])

  const rows = resolvedOrder.map<SourceRow>((uid) => {
    if (uid === ACTIVE_RULE_SOURCE_UID) {
      return {
        uid,
        name:
          activeProfile?.name ?? t('rules.page.sources.active.noSubscription'),
        enabled: true,
        readOnly: true,
        content: contents[uid] ?? 'rules: []\n',
        error: errors[uid],
      }
    }
    const source = sourceMap.get(uid)!
    return {
      uid,
      name: source.name,
      enabled: source.enabled,
      readOnly: false,
      content: contents[uid] ?? 'rules: []\n',
      error: errors[uid],
    }
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const saveSources = useCallback(
    (nextSources: IRuleSource[], order = resolvedOrder) =>
      patchVerge({ rule_sources: nextSources, rule_source_order: order }),
    [patchVerge, resolvedOrder],
  )

  const handleDragEnd = useLockFn(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = resolvedOrder.indexOf(String(active.id))
    const newIndex = resolvedOrder.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const nextOrder = arrayMove(resolvedOrder, oldIndex, newIndex)
    setPendingOrder(nextOrder)
    try {
      await patchVerge({ rule_source_order: nextOrder })
    } catch (error) {
      showNotice.error(error)
    } finally {
      setPendingOrder(null)
    }
  })

  const handleImport = useLockFn(async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
    })
    const path = Array.isArray(selected) ? selected[0] : selected
    if (!path) return
    let source: IRuleSource | undefined
    try {
      source = await importRuleSource(path)
      await saveSources([...sources, source], [...resolvedOrder, source.uid])
      showNotice.success('rules.page.sources.messages.imported')
    } catch (error) {
      if (source) await deleteRuleSourceFile(source.uid).catch(() => {})
      showNotice.error(error)
    }
  })

  const handleCreate = useLockFn(async () => {
    let source: IRuleSource | undefined
    try {
      source = await createRuleSource(newSourceName)
      await saveSources([...sources, source], [...resolvedOrder, source.uid])
      setCreateOpen(false)
      setNewSourceName('')
      showNotice.success('rules.page.sources.messages.created')
    } catch (error) {
      if (source) await deleteRuleSourceFile(source.uid).catch(() => {})
      showNotice.error(error)
    }
  })

  const handleDelete = useLockFn(async (source: IRuleSource) => {
    if (
      !window.confirm(
        t('rules.page.sources.messages.confirmDelete', { name: source.name }),
      )
    ) {
      return
    }
    try {
      await saveSources(
        sources.filter((item) => item.uid !== source.uid),
        resolvedOrder.filter((uid) => uid !== source.uid),
      )
      await deleteRuleSourceFile(source.uid)
      showNotice.success('rules.page.sources.messages.deleted')
    } catch (error) {
      showNotice.error(error)
    }
  })

  if (view === 'app-routing') {
    return <AppRoutingPage onBack={() => setView('sources')} />
  }

  return (
    <BasePage
      full
      title={t('rules.page.title')}
      contentStyle={{ height: '100%', overflow: 'auto' }}
      header={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button
            size="small"
            variant={view === 'sources' ? 'contained' : 'text'}
            startIcon={<RuleRounded />}
            onClick={() => setView('sources')}
          >
            {t('rules.page.tabs.sources')}
          </Button>
          <Button
            size="small"
            variant={view === 'preview' ? 'contained' : 'text'}
            startIcon={<PreviewRounded />}
            onClick={() => setView('preview')}
          >
            {t('rules.page.tabs.preview')}
          </Button>
          {view === 'preview' && <ProviderButton />}
        </Stack>
      }
    >
      {view === 'preview' ? (
        <EffectiveRules />
      ) : (
        <Box
          sx={{
            width: '100%',
            maxWidth: 980,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            pt: 1.5,
            pb: 3,
            boxSizing: 'border-box',
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              mb: 2,
            }}
          >
            <AppsOutlined color="primary" />
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 700 }}>
                  {t('rules.page.appRouting.title')}
                </Typography>
                <Chip
                  size="small"
                  color="primary"
                  label={t('rules.page.appRouting.highest')}
                />
                <Chip
                  size="small"
                  color={verge?.enable_app_routing ? 'success' : 'default'}
                  label={
                    verge?.enable_app_routing
                      ? t('rules.page.sources.status.enabled')
                      : t('rules.page.sources.status.disabled')
                  }
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('rules.page.appRouting.description', {
                  count:
                    verge?.app_routing_rules?.filter((rule) => rule.enabled)
                      .length ?? 0,
                })}
              </Typography>
            </Box>
            <Button
              startIcon={<TuneRounded />}
              onClick={() => setView('app-routing')}
            >
              {t('rules.page.appRouting.configure')}
            </Button>
          </Paper>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{
              mb: 1,
              justifyContent: 'space-between',
              alignItems: { xs: 'stretch', sm: 'center' },
            }}
          >
            <Box>
              <Typography variant="h6">
                {t('rules.page.sources.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('rules.page.sources.description')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<UploadFileRounded />}
                onClick={() => void handleImport()}
              >
                {t('rules.page.sources.actions.import')}
              </Button>
              <Button
                variant="contained"
                startIcon={<AddRounded />}
                onClick={() => setCreateOpen(true)}
              >
                {t('rules.page.sources.actions.create')}
              </Button>
            </Stack>
          </Stack>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={resolvedOrder}
              strategy={verticalListSortingStrategy}
            >
              <Stack spacing={1}>
                {rows.map((row) => {
                  const source = sourceMap.get(row.uid)
                  return (
                    <SortableSource
                      key={row.uid}
                      source={row}
                      onOpen={() =>
                        setEditor({
                          uid: row.uid,
                          title: row.name,
                          value: row.content,
                          readOnly: row.readOnly,
                        })
                      }
                      onEditOverride={
                        row.uid === ACTIVE_RULE_SOURCE_UID &&
                        activeProfile?.option?.rules
                          ? () => setSubscriptionRulesOpen(true)
                          : undefined
                      }
                      onToggle={(enabled) => {
                        if (!source) return
                        void saveSources(
                          sources.map((item) =>
                            item.uid === source.uid
                              ? { ...item, enabled }
                              : item,
                          ),
                        ).catch(showNotice.error)
                      }}
                      onDelete={() => source && void handleDelete(source)}
                    />
                  )
                })}
              </Stack>
            </SortableContext>
          </DndContext>

          <Divider sx={{ my: 2.5 }} />
          <Typography variant="h6">{t('rules.page.legacy.title')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('rules.page.legacy.description')}
          </Typography>
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileMore
                id="Merge"
                onSave={async (previous, current) => {
                  if (previous !== current) await enhanceProfiles()
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileMore
                id="Script"
                logInfo={chainLogs.Script}
                onSave={async (previous, current) => {
                  if (previous !== current) await enhanceProfiles()
                }}
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {editor && (
        <RuleSourceEditor
          key={`${editor.uid}-${editor.value}`}
          open
          title={editor.title}
          value={editor.value}
          path={`rule-source:${editor.uid}.yaml`}
          readOnly={editor.readOnly}
          onClose={() => setEditor(null)}
          onSave={async (value) => {
            const previousValue = contents[editor.uid] ?? 'rules: []\n'
            await saveRuleSourceFile(editor.uid, value)
            try {
              await saveSources(sources)
            } catch (error) {
              await saveRuleSourceFile(editor.uid, previousValue)
              throw error
            }
            setContents((current) => ({ ...current, [editor.uid]: value }))
            showNotice.success('rules.page.sources.messages.saved')
          }}
        />
      )}

      {subscriptionRulesOpen && activeProfile?.option?.rules && (
        <RulesEditorViewer
          groupsUid={activeProfile.option.groups ?? ''}
          mergeUid={activeProfile.option.merge ?? ''}
          profileUid={activeProfile.uid}
          property={activeProfile.option.rules}
          open
          onClose={() => setSubscriptionRulesOpen(false)}
          onSave={async () => {
            await enhanceProfiles()
          }}
        />
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('rules.page.sources.create.title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            sx={{ mt: 1 }}
            label={t('rules.page.sources.create.name')}
            value={newSourceName}
            onChange={(event) => setNewSourceName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newSourceName.trim())
                void handleCreate()
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>
            {t('shared.actions.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={!newSourceName.trim()}
            onClick={() => void handleCreate()}
          >
            {t('shared.actions.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </BasePage>
  )
}

export default RulesPage
