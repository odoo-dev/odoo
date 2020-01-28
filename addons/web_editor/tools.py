# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json
import re
import requests

from odoo import _
from odoo.tools import image_process
from odoo.modules.module import get_module_resource


# To detect if we have a valid URL or not
valid_url_regex = r'^(http:\/\/|https:\/\/|\/\/)[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$'

# Regex for few of the widely used video hosting services
player_regexes = {
    'youtube': r'^(?:(?:https?:)?\/\/)?(?:www\.)?(?:youtu\.be\/|youtube(-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((?:\w|-){11})(?:\S+)?$',
    'vimeo': r'\/\/(player.)?vimeo.com\/([a-z]*\/)*([0-9]{6,11})[?]?.*',
    'dailymotion': r'(?:.+dailymotion.com\/(video|hub|embed\/video|embed)|dai\.ly)\/([^_?]+)[^#]*(#video=([^_&]+))?',
    'instagram': r'(?:(.*)instagram.com|instagr\.am)\/p\/(.[a-zA-Z0-9-_\.]*)',
    'youku': r'(.*).youku\.com\/(v_show\/id_|embed\/)(.+)',
}


def get_video_source_data(video_url):
    ''' Computes the valid source, document ID and regex match from given URL
        (or False in case of invalid URL).
    '''
    if not video_url:
        return False

    if re.search(valid_url_regex, video_url):
        youtube_match = re.search(player_regexes['youtube'], video_url)
        if youtube_match and len(youtube_match.groups()[1]) == 11:
            return ('youtube', youtube_match.groups()[1], youtube_match)
        vimeo_match = re.search(player_regexes['vimeo'], video_url)
        if vimeo_match:
            return ('vimeo', vimeo_match.groups()[2], vimeo_match)
        dailymotion_match = re.search(player_regexes['dailymotion'], video_url)
        if dailymotion_match:
            return ('dailymotion', dailymotion_match.groups()[1], dailymotion_match)
        instagram_match = re.search(player_regexes['instagram'], video_url)
        if instagram_match:
            return ('instagram', instagram_match.groups()[1], instagram_match)
        youku_match = re.search(player_regexes['youku'], video_url)
        if youku_match:
            youku_link = youku_match.groups()[2]
            if '.html?' in youku_link:
                youku_link = youku_link.split('.html?')[0]
            return ('youku', youku_link, youku_match)
    return False


def get_video_url_data(video_url, **kwargs):
    ''' Computes the platform name and embed_url from given URL
        (or error message in case of invalid URL).
    '''
    source = get_video_source_data(video_url)
    if not source:
        return {'error': True, 'message': _('The provided url is invalid')}

    autoplay = kwargs.get('autoplay') and '?autoplay=1&mute=1' or '?autoplay=0'
    controls = kwargs.get('hide_controls') and '&controls=0' or ''
    loop = kwargs.get('loop') and '&loop=1' or ''

    # We directly use the provided URL as it is
    embed_url = video_url
    platform = source[0]
    platform_id = source[1]
    platform_match = source[2]
    if platform == 'youtube' and len(platform_id) == 11:
        fullscreen = kwargs.get('hide_fullscreen') and '&fs=0' or ''
        youtube_loop = loop and loop + '&playlist=%s' % (platform_id) or ''
        logo = kwargs.get('hide_yt_logo') and '&modestbranding=1' or ''
        params = '%s&rel=0%s%s%s%s' % (autoplay, youtube_loop, controls, fullscreen, logo)
        embed_url = '//www.youtube%s.com/embed/%s%s' % (platform_match.groups()[0] or '', platform_id, params)
    elif platform == 'vimeo':
        vimeo_autoplay = autoplay.replace('mute', 'muted')
        embed_url = '//player.vimeo.com/video/%s%s%s' % (platform_id, vimeo_autoplay, loop)
    elif platform == 'dailymotion':
        logo = kwargs.get('hide_dm_logo') and '&ui-logo=0' or ''
        share = kwargs.get('hide_dm_share') and '&sharing-enable=0' or ''
        params = '%s%s%s%s' % (autoplay, controls, logo, share)
        embed_url = '//www.dailymotion.com/embed/video/%s%s' % (platform_id, params)
    elif platform == 'instagram':
        embed_url = '//www.instagram.com/p/%s/embed/' % (platform_id)
    elif platform == 'youku':
        embed_url = '//player.youku.com/embed/%s' % (platform_id)

    return {'platform': platform, 'embed_url': embed_url}


def get_video_embed_code(video_url):
    ''' Computes the valid iframe from given URL that can be embedded
        (or False in case of invalid URL).
    '''
    data = get_video_url_data(video_url)
    if data.get('error'):
        return False
    return '<iframe class="embed-responsive-item" src="%s" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen="true" frameborder="0"></iframe>' % data.get('embed_url')


def get_video_thumbnail(video_url):
    ''' Computes the valid thumbnail image from given URL
        (or False in case of invalid URL).
    '''
    source = get_video_source_data(video_url)
    if not source:
        return False

    response = False
    platform = source[0]
    platform_id = source[1]
    if platform == 'youtube' and len(platform_id) == 11:
        response = requests.get('https://img.youtube.com/vi/' + platform_id + '/0.jpg')
    elif platform == 'vimeo':
        req = requests.get('http://vimeo.com/api/oembed.json?url=' + video_url)
        if req.status_code == 200:
            data = json.loads(req.content)
            response = requests.get(data['thumbnail_url'])
    elif platform == 'dailymotion':
        response = requests.get('https://www.dailymotion.com/thumbnail/video/' + platform_id)
    elif platform == 'instagram':
        response = requests.get('https://www.instagram.com/p/' + platform_id + '/media/?size=t')

    if response and response.status_code == 200:
        return image_process(base64.b64encode(response.content))
    else:
        # set a default image
        image_path = get_module_resource('web', 'static/src/img', 'placeholder.png')
        return image_process(base64.b64encode(open(image_path, 'rb').read()))
