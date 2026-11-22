const ACTION_LABELS = {
  'thread-create': '新建提问',
  'thread-escalate': '转交老师',
  'thread-join': '同问',
  'thread-follow-up': '追问',
  'thread-resolve': '确认解决',
  'thread-unresolve': '撤销已解决',
  'thread-withdraw': '撤下问题',
  'thread-reopen': '重新发起',
  'thread-feedback': '提交反馈',
  'thread-delete': '删除提问',
  'teacher-reply': '老师回复',
  'reply-undone': '撤回回复',
  'thread-info-request': '请学生补充',
  'thread-supplement': '学生补充',
  'thread-group': '调整同题组',
  'wall-submit': '提问墙匿名提问',
  'faq-add': '新增 FAQ',
  'faq-update': '编辑 FAQ',
  'faq-delete': '删除 FAQ',
  'course-note-update': '更新课程公告',
  'password-reset': '重置密码',
  'user-create': '创建账号',
  'user-update': '修改账号',
  'permission-denied': '越权请求被拒绝',
  reset: '重置共享空间',
  restore: '恢复备份',
  'state-save': '保存工作区',
}

function increment(map, action) {
  map.set(action, (map.get(action) ?? 0) + 1)
}

function threadLabel(thread) {
  if (thread.kind === 'follow-up') return 'thread-follow-up'
  if (thread.kind === 'same') return 'thread-join'
  if (thread.status === 'pending') return 'thread-escalate'
  return 'thread-create'
}

export function summarizeStateChange({ prev, next, mode }) {
  const actions = new Map()
  const courseIds = new Set()
  if (!prev) {
    return { action: '初始化共享空间', actions: ['state-save'], summary: '初始化共享空间', courseIds: [] }
  }
  if (mode === 'reset' || mode === 'restore') {
    return {
      action: ACTION_LABELS[mode],
      actions: [mode],
      summary: mode === 'reset' ? '恢复 5 门试点课程的初始演示数据' : '导入并恢复共享空间备份',
      courseIds: [],
    }
  }
  const prevThreads = new Map((prev.threads ?? []).map((thread) => [thread.id, thread]))
  const nextThreads = new Map((next.threads ?? []).map((thread) => [thread.id, thread]))
  for (const [id, thread] of nextThreads) {
    if (!prevThreads.has(id)) {
      increment(actions, threadLabel(thread))
      courseIds.add(thread.courseId)
    }
  }
  for (const [id, before] of prevThreads) {
    const after = nextThreads.get(id)
    if (!after) {
      increment(actions, 'thread-delete')
      courseIds.add(before.courseId)
      continue
    }
    if (!before.teacherReply && after.teacherReply) {
      increment(actions, 'teacher-reply')
      courseIds.add(after.courseId)
    }
    if (before.teacherReply && !after.teacherReply) {
      increment(actions, 'reply-undone')
      courseIds.add(after.courseId)
    }
    if (!before.resolvedAt && after.resolvedAt) {
      increment(actions, 'thread-resolve')
      courseIds.add(after.courseId)
    }
    if (before.resolvedAt && !after.resolvedAt) {
      increment(actions, 'thread-unresolve')
      courseIds.add(after.courseId)
    }
    if (!before.withdrawnAt && after.withdrawnAt) {
      increment(actions, 'thread-withdraw')
      courseIds.add(after.courseId)
    }
    if (before.withdrawnAt && !after.withdrawnAt) {
      increment(actions, 'thread-reopen')
      courseIds.add(after.courseId)
    }
    if (before.feedback !== after.feedback && after.feedback) {
      increment(actions, 'thread-feedback')
      courseIds.add(after.courseId)
    }
    if (before.status !== after.status) {
      if (after.status === 'needs-info' && after.teacherRequest) {
        increment(actions, 'thread-info-request')
        courseIds.add(after.courseId)
      }
      if (before.status === 'needs-info' && after.status === 'pending' && after.studentSupplement) {
        increment(actions, 'thread-supplement')
        courseIds.add(after.courseId)
      }
    }
    if (
      before.clusterId !== after.clusterId ||
      Boolean(before.groupLocked) !== Boolean(after.groupLocked)
    ) {
      increment(actions, 'thread-group')
      courseIds.add(after.courseId)
    }
  }
  const prevFaqs = new Map((prev.faqs ?? []).map((faq) => [faq.id, faq]))
  const nextFaqs = new Map((next.faqs ?? []).map((faq) => [faq.id, faq]))
  for (const [id, faq] of nextFaqs) {
    if (!prevFaqs.has(id)) {
      increment(actions, 'faq-add')
      courseIds.add(faq.courseId)
    } else if (JSON.stringify(prevFaqs.get(id)) !== JSON.stringify(faq)) {
      increment(actions, 'faq-update')
      courseIds.add(faq.courseId)
    }
  }
  for (const [id, faq] of prevFaqs) {
    if (!nextFaqs.has(id)) {
      increment(actions, 'faq-delete')
      courseIds.add(faq.courseId)
    }
  }
  const prevNotes = new Map((prev.courseNotes ?? []).map((note) => [note.courseId, note]))
  const nextNotes = new Map((next.courseNotes ?? []).map((note) => [note.courseId, note]))
  for (const [courseId, note] of nextNotes) {
    const before = prevNotes.get(courseId)
    if (!before || JSON.stringify(before) !== JSON.stringify(note)) {
      increment(actions, 'course-note-update')
      courseIds.add(courseId)
    }
  }
  for (const [courseId] of prevNotes) {
    if (!nextNotes.has(courseId)) {
      increment(actions, 'course-note-update')
      courseIds.add(courseId)
    }
  }
  if (actions.size === 0) {
    return { action: '保存工作区', actions: ['state-save'], summary: '同步工作区状态', courseIds: [...courseIds] }
  }
  const labels = [...actions.entries()].map(([action, count]) => {
    const label = ACTION_LABELS[action] ?? action
    return count > 1 ? `${label} ${count} 次` : label
  })
  return {
    action: labels.join('；'),
    actions: [...actions.keys()],
    summary: labels.join('；'),
    courseIds: [...courseIds],
  }
}

export function recordAudit(
  db,
  { user, revision = 0, action, actions = [], summary, courseIds = [], mode = null },
) {
  try {
    db.prepare(
      `INSERT INTO audit_log
         (revision, user_id, user_name, role, actions_json, course_ids_json, summary, mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      Number(revision) || 0,
      user.id,
      user.name,
      user.role,
      JSON.stringify(actions.length > 0 ? actions : [action]),
      JSON.stringify(Array.isArray(courseIds) ? courseIds : []),
      String(summary || action || '操作'),
      mode,
      Date.now(),
    )
  } catch {
    // Auditing must never break the main operation.
  }
}

export function listAudit(db, limit = 120) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 120))
  const rows = db
    .prepare(
      `SELECT id, revision, user_id, user_name, role, actions_json, course_ids_json,
              summary, mode, created_at
         FROM audit_log
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(safeLimit)
  return rows.map((row) => {
    let actions = []
    let courseIds = []
    try {
      const parsedActions = JSON.parse(row.actions_json)
      actions = Array.isArray(parsedActions) ? parsedActions : []
    } catch {
      actions = []
    }
    try {
      const parsedCourses = JSON.parse(row.course_ids_json)
      courseIds = Array.isArray(parsedCourses) ? parsedCourses : []
    } catch {
      courseIds = []
    }
    return {
      id: Number(row.id),
      revision: Number(row.revision),
      userId: row.user_id,
      userName: row.user_name,
      role: row.role,
      actions,
      courseIds,
      summary: row.summary,
      mode: row.mode,
      createdAt: Number(row.created_at),
    }
  })
}
