// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import Jobcard from '@/components/Jobcard.vue'

import { createJob, createJobCard } from './helpers/jobs'

describe('Jobcard.vue', () => {
  it('loads missing card data and reveals the description when clicked', async () => {
    const job = createJob()
    job.getCard = vi.fn(async () => {
      job.card = createJobCard()
      return job.card
    })

    const wrapper = mount(Jobcard, {
      props: {
        job,
      },
    })

    await wrapper.findAll('.card-content')[1].trigger('click')

    expect(job.getCard).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('负责前端页面开发')
  })

  it('renders active time badge and state color styles from job status', () => {
    const job = createJob({
      card: createJobCard({
        brandComInfo: {
          activeTime: Date.now(),
          customerBrandName: 'Acme',
          customerBrandStageName: '',
          encryptBrandId: 'brand-1',
          focusBrand: false,
          brandName: 'Acme',
          industry: 100020,
          industryName: '互联网',
          introduce: 'A fixture company',
          labels: [],
          logo: 'https://example.com/logo.png',
          scale: 301,
          scaleName: '100-499人',
          stage: 0,
          stageName: '',
          visibleBrandInfo: true,
        },
      }),
      status: {
        msg: '投递成功',
        setStatus: vi.fn(),
        status: 'success',
      },
    })

    const wrapper = mount(Jobcard, {
      props: {
        hover: true,
        job,
      },
    })

    expect(wrapper.attributes('style')).toContain('--state-color: #2ecc71')
    expect(wrapper.text()).toContain('活跃时间：')
    expect(wrapper.text()).toContain('投递成功')
  })

  it('covers pending and fallback state rendering plus description toggle off', async () => {
    const job = createJob({
      brandIndustry: '互联网',
      card: createJobCard({
        brandComInfo: {
          ...createJobCard().brandComInfo,
          activeTime: 0,
        },
      }),
      status: {
        msg: '',
        setStatus: vi.fn(),
        status: 'pending',
      },
    })

    const wrapper = mount(Jobcard, {
      props: {
        job,
      },
    })

    expect(wrapper.attributes('style')).toContain('--state-color: #CECECE')
    expect(wrapper.attributes('style')).toContain('--state-show: none')
    expect(wrapper.text()).toContain('无内容')
    expect(wrapper.text()).not.toContain('活跃时间：')

    await wrapper.findAll('.card-content')[1].trigger('click')
    await wrapper.find('.card-content[title]').trigger('click')

    expect(wrapper.find('.card-content[title]').isVisible()).toBe(false)
  })
})
