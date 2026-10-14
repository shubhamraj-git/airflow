 .. Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

 ..   http://www.apache.org/licenses/LICENSE-2.0

 .. Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.

Customizing the UI
==================

.. _customizing-the-ui:

Customizing Dag UI Header and Airflow Page Titles
-------------------------------------------------

Airflow now allows you to customize the Dag home page header and page title. This will help
distinguish between various installations of Airflow or simply amend the page text.

.. note::

    The custom title will be applied to both the page header and the page title.

To make this change, simply:

1.  Add the configuration option of ``instance_name`` under the ``[api]`` section inside ``airflow.cfg``:

.. code-block::

  [api]

  instance_name = "DevEnv"


2.  Alternatively, you can set a custom title using the environment variable:

.. code-block::

  AIRFLOW__API__INSTANCE_NAME = "DevEnv"


Screenshots
^^^^^^^^^^^

Before
""""""

.. image:: ../img/change-site-title/default_instance_name_configuration.png

After
"""""

.. image:: ../img/change-site-title/example_instance_name_configuration.png

.. _customizing-ui-theme:

Customizing UI theme
--------------------

We can provide a JSON configuration to customize the UI.

.. important::

  - You can customize the ``brand``, ``gray``, ``black``, and ``white`` color tokens, ``globalCss``, and the navigation icon via ``icon`` (and ``icon_dark_mode``).
  - All top-level fields (``tokens``, ``globalCss``, ``icon``, ``icon_dark_mode``) are **optional** — you can supply any combination, including an empty ``{}`` to restore OSS defaults.
  - All color tokens are **optional** — you can override any subset without supplying the others.
  - ``brand`` and ``gray`` each accept an 11-shade scale with keys ``50``–``950``.
  - ``black`` and ``white`` each accept a single color: ``{ "value": "oklch(...)" }``.
  - OKLCH colors must use the format ``oklch(l c h)``. For more info see :ref:`config:api__theme`
  - There is also the ability to provide custom global CSS for fine-grained theme control.

.. note::

  Modifying the ``brand`` color palette also modifies the navbar/sidebar.
  Modifying ``gray`` controls neutral surfaces and borders.
  Modifying ``black`` and ``white`` controls the darkest and lightest surface colors.

To customize the UI, simply:

1.  Add the configuration option of ``theme`` under the ``[api]`` section inside ``airflow.cfg``:

.. code-block::

  [api]

  theme = {
      "tokens": {
        "colors": {
          "brand": {
            "50": { "value": "oklch(0.971 0.013 17.38)" },
            "100": { "value": "oklch(0.936 0.032 17.717)" },
            "200": { "value": "oklch(0.885 0.062 18.334)" },
            "300": { "value": "oklch(0.808 0.114 19.571)" },
            "400": { "value": "oklch(0.704 0.191 22.216)" },
            "500": { "value": "oklch(0.637 0.237 25.331)" },
            "600": { "value": "oklch(0.577 0.245 27.325)" },
            "700": { "value": "oklch(0.505 0.213 27.518)" },
            "800": { "value": "oklch(0.444 0.177 26.899)" },
            "900": { "value": "oklch(0.396 0.141 25.723)" },
            "950": { "value": "oklch(0.258 0.092 26.042)" }
          }
        }
      }
    }


.. note::

  The whitespace, particularly on the last line, is important so a multi-line value works properly. More details can be found in the
  the `configparser docs <https://docs.python.org/3/library/configparser.html#supported-ini-file-structure>`_.

2.  Alternatively, you can set a custom theme using the environment variable:

.. code-block::

  AIRFLOW__API__THEME='{
    "tokens": {
      "colors": {
        "brand": {
          "50": { "value": "oklch(0.971 0.013 17.38)" },
          "100": { "value": "oklch(0.936 0.032 17.717)" },
          "200": { "value": "oklch(0.885 0.062 18.334)" },
          "300": { "value": "oklch(0.808 0.114 19.571)" },
          "400": { "value": "oklch(0.704 0.191 22.216)" },
          "500": { "value": "oklch(0.637 0.237 25.331)" },
          "600": { "value": "oklch(0.577 0.245 27.325)" },
          "700": { "value": "oklch(0.505 0.213 27.518)" },
          "800": { "value": "oklch(0.444 0.177 26.899)" },
          "900": { "value": "oklch(0.396 0.141 25.723)" },
          "950": { "value": "oklch(0.258 0.092 26.042)" }
        }
      }
    }
  }'


Screenshots
^^^^^^^^^^^

Light Mode
""""""""""

.. image:: ../img/change-theme/example_theme_configuration_light_mode.png

Dark Mode
"""""""""

.. image:: ../img/change-theme/example_theme_configuration_dark_mode.png

3.  To add custom CSS rules to the airflow UI, you can include a ``globalCss`` key in the theme configuration. More information https://chakra-ui.com/docs/theming/customization/global-css

.. code-block::

  AIRFLOW__API__THEME='{
    "tokens": {
      "colors": {
        "brand": {
          "50": { "value": "oklch(0.971 0.013 17.38)" },
          "100": { "value": "oklch(0.936 0.032 17.717)" },
          "200": { "value": "oklch(0.885 0.062 18.334)" },
          "300": { "value": "oklch(0.808 0.114 19.571)" },
          "400": { "value": "oklch(0.704 0.191 22.216)" },
          "500": { "value": "oklch(0.637 0.237 25.331)" },
          "600": { "value": "oklch(0.577 0.245 27.325)" },
          "700": { "value": "oklch(0.505 0.213 27.518)" },
          "800": { "value": "oklch(0.444 0.177 26.899)" },
          "900": { "value": "oklch(0.396 0.141 25.723)" },
          "950": { "value": "oklch(0.258 0.092 26.042)" }
        }
      }
    },
    "globalCss": {
      "button": {
        "text-transform": "uppercase"
      }
    }
  }'

Customizing gray, black, and white tokens
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

You can override the neutral palette and surface colors independently of ``brand``. ``gray`` controls
borders and neutral UI elements, while ``black`` and ``white`` control the darkest and lightest surface
backgrounds. All fields are optional — supply only the tokens you want to change.

.. code-block::

  AIRFLOW__API__THEME='{
    "tokens": {
      "colors": {
        "gray": {
          "50":  { "value": "oklch(0.975 0.002 264.0)" },
          "100": { "value": "oklch(0.950 0.003 264.0)" },
          "200": { "value": "oklch(0.880 0.005 264.0)" },
          "300": { "value": "oklch(0.780 0.008 264.0)" },
          "400": { "value": "oklch(0.640 0.012 264.0)" },
          "500": { "value": "oklch(0.520 0.015 264.0)" },
          "600": { "value": "oklch(0.420 0.015 264.0)" },
          "700": { "value": "oklch(0.340 0.012 264.0)" },
          "800": { "value": "oklch(0.260 0.009 264.0)" },
          "900": { "value": "oklch(0.200 0.007 264.0)" },
          "950": { "value": "oklch(0.145 0.005 264.0)" }
        },
        "black": { "value": "oklch(0.220 0.025 288.6)" },
        "white": { "value": "oklch(0.985 0.002 264.0)" }
      }
    }
  }'

Icon (SVG-only)
^^^^^^^^^^^^^^^

You can replace the default Airflow icon in the navigation bar by providing an ``icon`` key (and optionally
``icon_dark_mode`` for dark color mode) in the ``theme`` configuration. The value must be either an absolute
``http(s)`` URL or an app-relative path starting with ``/``, and must point to an ``.svg`` file.

.. code-block::

  [api]

  theme = {
      "tokens": {
        "colors": {
          "brand": {
            "50": { "value": "oklch(0.971 0.013 17.38)" },
            "100": { "value": "oklch(0.936 0.032 17.717)" },
            "200": { "value": "oklch(0.885 0.062 18.334)" },
            "300": { "value": "oklch(0.808 0.114 19.571)" },
            "400": { "value": "oklch(0.704 0.191 22.216)" },
            "500": { "value": "oklch(0.637 0.237 25.331)" },
            "600": { "value": "oklch(0.577 0.245 27.325)" },
            "700": { "value": "oklch(0.505 0.213 27.518)" },
            "800": { "value": "oklch(0.444 0.177 26.899)" },
            "900": { "value": "oklch(0.396 0.141 25.723)" },
            "950": { "value": "oklch(0.258 0.092 26.042)" }
          }
        }
      },
      "icon": "/static/company-icon.svg",
      "icon_dark_mode": "/static/company-icon-dark.svg"
    }

.. note::

  - Only SVG icons are supported.
  - If the icon fails to load, Airflow falls back to its default icon.
  - Icon sizing is controlled by the UI and cannot be configured via the theme.

|

Adding Dashboard Alert Messages
===============================

Extra alert messages can be shown on the Airflow dashboard. This can be useful for warning about setup issues, announcing changes
to end users, or providing real-time status information. Dashboard alerts support both static and dynamic content.

Basic Static Alerts
-------------------

To add static alert messages that remain constant until the webserver is restarted:

1. Create an ``airflow_local_settings.py`` file and place it in ``$PYTHONPATH`` or in the ``$AIRFLOW_HOME/config`` folder.
   (Airflow adds ``$AIRFLOW_HOME/config`` to ``PYTHONPATH`` when Airflow is initialized)

2. Add the following contents to ``airflow_local_settings.py``:

  .. note::
      See :ref:`Configuring local settings <set-config:configuring-local-settings>` for details on how to configure local settings.

  .. code-block:: python

      from airflow.api_fastapi.common.types import UIAlert

      DASHBOARD_UIALERTS = [
          UIAlert(text="Welcome to Airflow", category="info"),
      ]

3. Restart the Airflow webserver, and you should now see the alert message displayed on the dashboard.

Alert Categories
----------------

You can control the category of the alert message. Available categories include:

- ``"info"`` (default) - Blue informational alerts
- ``"warning"`` - Yellow warning alerts
- ``"error"`` - Red error alerts

.. code-block:: python

      from airflow.api_fastapi.common.types import UIAlert

      DASHBOARD_UIALERTS = [
          UIAlert(text="Welcome to Airflow.", category="info"),
          UIAlert(text="Airflow server downtime scheduled for tomorrow at 10:00 AM.", category="warning"),
          UIAlert(text="Critical error detected!", category="error"),
      ]

.. image:: ../img/ui-alert-message.png

Markdown Content in Alerts
--------------------------

Markdown can be included in alert messages for richer formatting. In the following example, we show an alert
message of heading 2 with a link included:

.. code-block:: python

    from airflow.api_fastapi.common.types import UIAlert

    DASHBOARD_UIALERTS = [
        UIAlert(text="## Visit [airflow.apache.org](https://airflow.apache.org)", category="info"),
    ]

.. image:: ../img/ui-alert-message-markdown.png

Dynamic Dashboard Alerts
------------------------

Dashboard alerts support dynamic content that updates each time the dashboard page is refreshed. This allows for real-time
status updates without requiring webserver restarts. Dynamic alerts must be defined as an instance of an iterable object.
The recommended approach is to create a class that subclasses ``list`` and implements a custom ``__iter__`` method that
yields fresh alerts each time Airflow iterates over the alerts.

.. note::
  When implementing dynamic alerts it is important to keep alert generation logic lightweight to avoid
  impacting dashboard load times. Consider caching results for expensive operations and handle exceptions
  gracefully to prevent alert generation from breaking the UI.

Dynamic alerts are particularly useful for:

- **Real-time notifications**: Display current status updates or announcements
- **Deployment notifications**: Show current deployment status, build progress, or GitOps state
- **Temporary maintenance alerts**: Provide time-sensitive information about ongoing maintenance or issues
- **Environment-specific warnings**: Display different alerts based on current environment conditions
- **External service status**: Show the availability of dependent services or APIs

Creating Dynamic Alerts
^^^^^^^^^^^^^^^^^^^^^^^

To create dynamic alerts, define ``DASHBOARD_UIALERTS`` as an instance of a class that subclasses ``list``
and implements the ``__iter__`` method. The UI will iterate over any number ``UIAlert`` instances yielded by
this method and expose them as alerts on the dashboard page.

The example below demonstrates how logic can be applied to yield alerts dynamically. More practical use
cases might include alerts yielded from APIs, database queries or files.

.. code-block:: python

    import random
    from airflow.api_fastapi.common.types import UIAlert


    class DynamicAlerts(list):
        def __iter__(self):
            # This method is called each time Airflow iterates over DASHBOARD_UIALERTS
            # Example: Flip a coin
            if random.choice([True, False]):
                yield UIAlert(text="Heads!", category="info")
            else:
                yield UIAlert(text="Tails!", category="warning")


    # Create an instance of the class
    DASHBOARD_UIALERTS = DynamicAlerts()

Adding a News Feed to the Home Page
===================================

The home page can show a **News feed** section: a list of dated entries that administrators write for
every user of the deployment, optionally merged with entries of remote feeds such as the Apache
Airflow blog. Use it for planned maintenance, internal release notes or policy changes that are
not urgent enough for a :ref:`dashboard alert <customizing-the-ui>` but should still reach everyone.

The section is shown when :ref:`config:api__news_feed_enabled` is ``True`` (the default); with
nothing to show it reads "No news yet" and that announcements and updates will appear there. On wide screens it takes a column to the right of the stats and favorite
Dags, exactly as tall as they are; on narrow ones it follows them. Up to :ref:`config:api__news_feed_max_entries` entries (20 by default) are listed,
by priority and then newest first, each as a card: who it is from and the publication time on the
first line, the title (linked when the entry has a link) on the second, and the body below. A
``P0`` (critical) card is red and a ``P1`` (important) card is amber, each with its priority
badge; ``P2`` (normal) cards keep the neutral style. Entries from the public Apache Airflow feeds
are shown as from *Apache Airflow* and are always ``P2``. The box shows as many cards as fit, and
**Show all** opens every entry in a scrollable dialog. A badge next to the title counts the entries that appeared since the browser's previous
visit.

Writing news items
------------------

Users whose auth manager grants them the news feed management permission (the ``Admin`` role with
the simple auth manager, the ``News Feed`` resource with the FAB auth manager) manage the feed
under **Admin > News Feed**. A news item has a title, an optional *From* name such as a team
(``author`` in the API; an item without one is shown as from this deployment), a priority
(``P0``, ``P1`` or ``P2``, the default), an optional Markdown body, an optional link,
a publication time (defaults to now; a future time schedules the item) and an expiry chosen from
presets (1 day, 7 days, indefinite, or a custom time). Expired and not yet published items are
hidden from the home page but stay editable on the admin page. Until the first item exists, the admin
page explains the feature in place of the table.

Items can also be created and maintained through the REST API, which is handy for automation such as
posting release notes from a deployment pipeline:

.. code-block:: bash

    curl -X POST "http://localhost:8080/api/v2/newsItems" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "title": "Scheduler restart tonight",
        "author": "Platform team",
        "priority": "P1",
        "body": "The scheduler restarts at **22:00 UTC**; running tasks are not affected.",
        "url": "https://wiki.example.com/airflow/maintenance",
        "expires_at": "2026-10-16T00:00:00Z"
      }'

Remote sources
--------------

The feed can additionally include remote **Atom** or **RSS** feeds. Their entries are not fetched
by browsers: the ``airflow news-feed sync`` command fetches every enabled source from inside the
deployment, reduces each entry to plain text and stores it as a news item, and records the
outcome on the source. Each source has a sync interval, chosen when it is created or edited
(5 minutes, 15 minutes, 1 hour, or a custom number of minutes of at least 5; 1 hour by default):
a run fetches only the sources whose interval has passed since their last fetch. Schedule the
command often, for example every minute from cron or a Kubernetes CronJob, with database access
like any other Airflow CLI command; a run with nothing due contacts no host:

.. code-block:: bash

    airflow news-feed sync

It exits with an error when a source failed, so a scheduler can alert on it. ``--force`` fetches
every enabled source regardless of its interval, and ``--source-id`` fetches one source now.
Each source also has a maximum number of entries (5, 10, 25, 50, or a custom number from 1 to
100; 10 by default): the command keeps only the newest ones, and lowering the maximum removes the
older stored entries at once. Changing a source's URL clears its last sync outcome and the entries stored
from the old URL; the next run fetches the new one. The command refuses URLs that are not ``http(s)``, hosts that resolve to a
loopback, private or link-local address, redirects, responses above 5 MiB and feeds carrying a
DOCTYPE or entity declarations; it stores at most 100 entries per source. Stored entries expire
according to the source's time-to-live (default 30 days) and disappear with the source.

The *Public Airflow Feed* button shows whether the public feeds are on (at least one enabled) or off, and
opens a dialog that lists each of them with its enabled state, URL, time-to-live, sync interval
and the outcome of the last sync; once a feed is on, it is shown read-only until its edit button
is clicked: the Apache Airflow announcements page
(``https://airflow.apache.org/announcements/``, read as dated sections) and the Apache Airflow
blog feed (``https://airflow.apache.org/blog/index.xml``). The URL of either feed can be replaced
with an internal mirror, for deployments where the sync command cannot reach ``airflow.apache.org``.
Other Atom or RSS feeds, such as an internal blog, are added with the *Remote sources* button next
to it, which opens a dialog listing each source with its label, URL, time-to-live, enabled state
and last sync outcome. Stored sources are shown read-only until their edit button is clicked, so
nothing changes by accident, and the same agreement is asked before the first one is switched on.
The REST API (``/api/v2/newsSources``) manages the same rows. Items written by administrators fill
the list first; remote entries take the remaining places and are the ones left out when the limit
is reached.

.. warning::

    Enabling a remote source makes the deployment contact that host whenever the sync command
    runs. The public feeds are off by default; while saving the dialog would switch them on, it
    explains this, lets the administrator choose the announcements and/or the blog, and its
    confirm button reads *I agree, enable*. *Disable all* switches every public feed off at once.

Air-gapped deployments
^^^^^^^^^^^^^^^^^^^^^^

Nothing is fetched from the internet unless an administrator enables a remote source and the sync
command is scheduled, so an air-gapped deployment only needs to leave the public feeds off or not
schedule the command. To make that a guarantee that administrators cannot change from the UI, set
:ref:`config:api__news_feed_allow_remote_sources` to ``False``; the sync command then syncs
nothing, the REST API refuses to create or enable sources (``403 Forbidden``) and returns no remote
entries, and the home page shows only the items written by administrators:

.. code-block:: ini

    [api]
    news_feed_allow_remote_sources = False

Internal mirrors that the sync command can reach can still be used while the option is ``True``:
enter the mirror's URL for the announcements or the blog instead of the official one.

To keep the Apache Airflow feeds off the home page while other remote sources stay allowed, set
:ref:`config:api__news_feed_allow_public_airflow_feeds` to ``False`` instead: the *Public Airflow
Feed* button disappears, the sync command skips those feeds, the REST API refuses to enable them
(``403 Forbidden``) and their stored entries are no longer returned. Disabling or deleting a source
is always possible. While :ref:`config:api__news_feed_enabled` is ``False`` the sync command fetches
nothing.

When the last sync of an enabled source failed, the News section shows a one-line warning naming
the source, an error icon marks the *Public Airflow Feed* or *Remote sources* button, and the
dialogs show the error; the items written by administrators and the entries
stored by earlier runs are shown regardless.
