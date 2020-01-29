import {regexRule, createTokenizer} from 'doken'
import {arrAdd} from './helper'

export function parseLabel(input) {
  if (input[0] !== '"') return null

  let i = 1
  let braceNesting = 0
  let wrapped = input[1] === '{'

  while (i < input.length) {
    let c = input[i]

    if (c === '"' && braceNesting <= 0) break
    if (c === '\\') i++
    if (c === '{') braceNesting++
    if (c === '}') {
      braceNesting--
      if (braceNesting === 0 && input[i + 1] !== '"') wrapped = false
    }

    i++
  }

  if (input[i] !== '"') return null

  return {
    match: input.slice(0, i + 1),
    value: !wrapped ? input.slice(1, i) : input.slice(2, i - 1),
    wrapped
  }
}

export function parseNode(input) {
  let i = 0

  while (i < input.length) {
    let c = input[i]

    if (
      ['&', '%'].includes(c) ||
      [/^\\\\/, /^\\arrow\s*\[/, /^\\end\s*{tikzcd}/].some(
        regex => regex.exec(input.slice(i)) != null
      )
    ) {
      break
    }

    if (c === '\\') i++
    i++
  }

  let match = input.slice(0, i).trim()
  if (match[match.length - 1] === '\\') match += input[match.length]

  let wrapped = match[0] === '{' && match[match.length - 1] === '}'

  return {
    match,
    value: wrapped ? match.slice(1, -1) : match,
    wrapped
  }
}

export const tokenizeArrow = createTokenizer({
  rules: [
    regexRule('_whitespace', /^\s+/),
    regexRule('_comma', /^,/),
    regexRule('command', /^\\arrow\s*\[/),
    regexRule('end', /^\]/),
    regexRule('alt', /^'/),
    regexRule('direction', /^[lrud]+(?!\w)/),
    regexRule('argName', /^([a-zA-Z]+ )*[a-zA-Z]+/),
    regexRule('argValue', /^=(\d+(em)?)/, match => match[1]),
    {
      type: 'label',
      match: input => {
        let label = parseLabel(input)
        if (label == null) return null

        return {
          length: label.match.length,
          value: label.value
        }
      }
    }
  ],
  shouldStop: token => [null, 'end'].includes(token.type)
})

export const tokenize = createTokenizer({
  rules: [
    regexRule('_whitespace', /^\s+/),
    regexRule('_comment', /^%.*/),
    regexRule('begin', /^\\begin\s*{tikzcd}/),
    regexRule('end', /^\\end\s*{tikzcd}/),
    {
      type: 'node',
      match: input => {
        let {match, value} = parseNode(input)
        return match.length === 0
          ? null
          : {
              length: match.length,
              value
            }
      }
    },
    {
      type: 'arrow',
      match: input => {
        if (!input.startsWith('\\arrow')) return null

        let tokens = [...tokenizeArrow(input)]
        if (tokens.length < 2) return null

        let lastToken = tokens[tokens.length - 1]
        if (
          tokens.length < 2 ||
          tokens[0].type !== 'command' ||
          lastToken.type !== 'end'
        )
          return null

        return {
          length: lastToken.pos + lastToken.length,
          value: tokens
        }
      }
    },
    regexRule('align', /^&/),
    regexRule('newrow', /^\\\\/)
  ],
  shouldStop: token => [null, 'end'].includes(token.type)
})

export function parseArrowTokens(tokens) {
  let arrow = {
    direction: [0, 0],
    args: []
  }

  let arg = null

  for (let token of tokens) {
    if (token.type == null) {
      let error = new Error(`Unexpected token at ${token.pos}`)
      error.token = token

      throw token
    }

    if (token.type === 'direction') {
      let chars = [...token.value]

      arrow.direction = chars.reduce(
        (direction, c) =>
          arrAdd(
            direction,
            {
              l: [-1, 0],
              r: [1, 0],
              u: [0, -1],
              d: [0, 1]
            }[c]
          ),
        [0, 0]
      )
    }

    if (token.type === 'label') {
      arrow.args.push(
        (arg = {
          name: 'label',
          value: token.value
        })
      )
    } else if (token.type === 'argName') {
      arrow.args.push(
        (arg = {
          name: token.value
        })
      )
    } else if (token.type === 'argValue' && arg != null) {
      arg.value = token.value
    } else if (token.type === 'alt' && arg != null) {
      arg.alt = true
    } else {
      arg = null
    }
  }

  return arrow
}

export function parseArrow(input) {
  return parseArrowTokens(tokenizeArrow(input))
}
