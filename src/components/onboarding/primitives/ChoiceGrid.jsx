/**
 * ChoiceGrid - a staggered group of ChoiceButtons.
 *
 * Owns the entrance stagger and the radiogroup/group semantics so individual
 * steps stay declarative. Options enter 70ms apart, never all at once.
 */

import { motion } from 'framer-motion'
import { DURATION, EASE, STAGGER, useReducedMotion } from '../../../lib/motion'
import ChoiceButton from './ChoiceButton'

export default function ChoiceGrid({
  options,
  value,
  onChange,
  onAdvance = null,
  multi = false,
  label = 'Answer options',
  columns = 1,
}) {
  const reduced = useReducedMotion()

  const selectedList = multi ? (Array.isArray(value) ? value : []) : []

  const container = {
    hidden: {},
    show: {
      transition: reduced
        ? { duration: DURATION.micro }
        : { staggerChildren: STAGGER.children },
    },
  }

  const item = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: DURATION.micro } } }
    : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE.out } } }

  const handleSelect = (optValue) => {
    if (multi) {
      const next = selectedList.includes(optValue)
        ? selectedList.filter((v) => v !== optValue)
        : [...selectedList, optValue]
      onChange?.(next, optValue)
      return
    }
    onChange?.(optValue)
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      role={multi ? 'group' : 'radiogroup'}
      aria-label={label}
      style={{
        display: 'grid',
        gridTemplateColumns: columns > 1 ? `repeat(${columns}, minmax(0, 1fr))` : '1fr',
        gap: 10,
      }}
    >
      {options.map((opt) => {
        const optValue = opt.value ?? opt
        const selected = multi ? selectedList.includes(optValue) : value === optValue
        return (
          <motion.div key={optValue} variants={item}>
            <ChoiceButton
              label={opt.label ?? optValue}
              sublabel={opt.sublabel ?? null}
              selected={selected}
              multi={multi}
              onSelect={() => handleSelect(optValue)}
              onAdvance={multi ? null : onAdvance}
            />
          </motion.div>
        )
      })}
    </motion.div>
  )
}
